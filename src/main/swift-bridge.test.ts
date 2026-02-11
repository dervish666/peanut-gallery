import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PassThrough } from 'stream'
import { EventEmitter } from 'events'
import type { ChildProcess } from 'child_process'

// We create fresh mock streams per test
let mockStdin: PassThrough
let mockStdout: PassThrough
let mockStderr: PassThrough
let mockProc: EventEmitter & Partial<ChildProcess>

const spawnMock = vi.fn()

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
}))

function createMockProcess() {
  mockStdin = new PassThrough()
  mockStdout = new PassThrough()
  mockStderr = new PassThrough()
  mockProc = Object.assign(new EventEmitter(), {
    stdin: mockStdin,
    stdout: mockStdout,
    stderr: mockStderr,
    pid: 12345,
    kill: vi.fn(),
  })
  return mockProc
}

function sendResponse(data: object): void {
  mockStdout.write(JSON.stringify(data) + '\n')
}

describe('SwiftBridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    spawnMock.mockImplementation(() => createMockProcess())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function createBridge() {
    const { SwiftBridge } = await import('./swift-bridge')
    const bridge = new SwiftBridge()
    await bridge.start()
    return bridge
  }

  describe('listApps', () => {
    it('sends list-apps command and returns parsed apps', async () => {
      const bridge = await createBridge()

      const promise = bridge.listApps()

      sendResponse({
        type: 'apps',
        apps: [{ name: 'Claude', pid: 100, bundleIdentifier: 'com.anthropic.claudefordesktop' }],
      })

      const apps = await promise
      expect(apps).toHaveLength(1)
      expect(apps[0].name).toBe('Claude')
      expect(apps[0].bundleIdentifier).toBe('com.anthropic.claudefordesktop')
      bridge.destroy()
    })
  })

  describe('readConversation', () => {
    it('sends read-conversation command and returns parsed conversation', async () => {
      const bridge = await createBridge()

      const promise = bridge.readConversation(100)

      sendResponse({
        type: 'conversation',
        app: 'Claude',
        pid: 100,
        title: 'Test Chat',
        messages: [{ role: 'user', text: 'hello', timestamp: null, index: 0 }],
      })

      const convo = await promise
      expect(convo.title).toBe('Test Chat')
      expect(convo.messages).toHaveLength(1)
      expect(convo.messages[0].text).toBe('hello')
      bridge.destroy()
    })
  })

  describe('error handling', () => {
    it('rejects with SwiftBridgeError on error responses', async () => {
      const { SwiftBridge, SwiftBridgeError } = await import('./swift-bridge')
      const bridge = new SwiftBridge()
      await bridge.start()

      const promise = bridge.listApps()

      sendResponse({
        type: 'error',
        code: 'no_window',
        message: 'No window found',
      })

      await expect(promise).rejects.toThrow(SwiftBridgeError)
      await expect(promise).rejects.toThrow('No window found')
      bridge.destroy()
    })

    it('rejects when bridge is destroyed', async () => {
      const bridge = await createBridge()
      bridge.destroy()
      await expect(bridge.listApps()).rejects.toThrow('Swift bridge has been destroyed')
    })
  })

  describe('command queue', () => {
    it('processes multiple commands sequentially', async () => {
      vi.useRealTimers() // This test needs real I/O timing
      const bridge = await createBridge()

      // Send two commands — second should queue behind first
      const p1 = bridge.listApps()
      const p2 = bridge.readConversation(100)

      // Respond to first
      sendResponse({ type: 'apps', apps: [] })
      const apps = await p1
      expect(apps).toEqual([])

      // Respond to second (which should now be active after first resolved)
      sendResponse({
        type: 'conversation',
        app: 'Test',
        pid: 100,
        title: 'Test',
        messages: [],
      })
      const convo = await p2
      expect(convo.title).toBe('Test')
      bridge.destroy()
    })
  })

  describe('command timeout', () => {
    it('rejects command after 10s timeout', async () => {
      const bridge = await createBridge()

      const promise = bridge.listApps()

      vi.advanceTimersByTime(10001)

      await expect(promise).rejects.toThrow('Command timed out')
      bridge.destroy()
    })
  })

  describe('destroy', () => {
    it('rejects all pending commands', async () => {
      const bridge = await createBridge()

      const p1 = bridge.listApps()
      const p2 = bridge.readConversation(100)

      bridge.destroy()

      await expect(p1).rejects.toThrow('Swift bridge destroyed')
      await expect(p2).rejects.toThrow('Swift bridge destroyed')
    })

    it('kills the child process', async () => {
      const bridge = await createBridge()
      bridge.destroy()
      expect(mockProc.kill).toHaveBeenCalled()
    })
  })

  describe('process exit', () => {
    it('emits exit event when process exits', async () => {
      const bridge = await createBridge()
      const exitHandler = vi.fn()
      bridge.on('exit', exitHandler)

      mockProc.emit('exit', 1)

      expect(exitHandler).toHaveBeenCalledWith(1)
      bridge.destroy()
    })

    it('rejects active command when process exits unexpectedly', async () => {
      const bridge = await createBridge()

      const promise = bridge.listApps()
      mockProc.emit('exit', 1)

      await expect(promise).rejects.toThrow('Swift helper exited unexpectedly')
      bridge.destroy()
    })
  })

  describe('push events', () => {
    it('emits app-activated event for unsolicited app-activated messages', async () => {
      vi.useRealTimers()
      const bridge = await createBridge()
      const handler = vi.fn()
      bridge.on('app-activated', handler)

      // Send unsolicited push event (no active command)
      sendResponse({
        type: 'app-activated',
        bundleId: 'com.anthropic.claudefordesktop',
        pid: 999,
      })

      // Allow event processing
      await new Promise((r) => setTimeout(r, 50))

      expect(handler).toHaveBeenCalledWith('com.anthropic.claudefordesktop', 999)
      bridge.destroy()
    })

    it('does not interfere with active command responses', async () => {
      vi.useRealTimers()
      const bridge = await createBridge()
      const handler = vi.fn()
      bridge.on('app-activated', handler)

      // Start a command
      const promise = bridge.listApps()

      // Push event arrives while command is active
      sendResponse({
        type: 'app-activated',
        bundleId: 'com.example.other',
        pid: 555,
      })

      // Then the actual command response arrives
      sendResponse({
        type: 'apps',
        apps: [{ name: 'Claude', pid: 100, bundleIdentifier: 'com.anthropic.claudefordesktop' }],
      })

      const apps = await promise
      expect(apps).toHaveLength(1)

      await new Promise((r) => setTimeout(r, 50))
      expect(handler).toHaveBeenCalledWith('com.example.other', 555)
      bridge.destroy()
    })
  })
})
