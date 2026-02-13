import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { EventEmitter } from 'events'
import { is } from '@electron-toolkit/utils'
import type {
  SwiftResponse,
  AppsResponse,
  ConversationResponse,
  AppActivatedResponse,
  AppInfo,
  Conversation,
} from '../shared/types'

export class SwiftBridgeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SwiftBridgeError'
  }
}

interface QueuedCommand {
  command: object
  resolve: (response: SwiftResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

const COMMAND_TIMEOUT_MS = 10000
const MAX_RESTART_ATTEMPTS = 10
const RESTART_BACKOFF_MS = 2000
const RESTART_BACKOFF_CAP_MS = 15000
const RESTART_DECAY_MS = 60000 // reset restart counter if last crash was >60s ago

export class SwiftBridge extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer: string = ''
  private queue: QueuedCommand[] = []
  private active: QueuedCommand | null = null
  private destroyed = false
  private restartCount = 0
  private restarting = false
  private lastCrashTime = 0

  private getBinaryPath(): string {
    if (is.dev) {
      return join(process.cwd(), 'resources', 'ax-reader')
    }
    return join(process.resourcesPath, 'ax-reader')
  }

  async start(): Promise<void> {
    this.destroyed = false
    this.spawnProcess()
  }

  private spawnProcess(): void {
    const binaryPath = this.getBinaryPath()
    this.process = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.buffer = ''

    this.process.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.process.stderr!.on('data', (data: Buffer) => {
      console.error('[ax-reader stderr]', data.toString())
    })

    this.process.on('exit', (code) => {
      console.log(`[ax-reader] exited with code ${code}`)
      this.process = null

      // Reject the active command if any
      if (this.active) {
        clearTimeout(this.active.timer)
        this.active.reject(new Error(`Swift helper exited unexpectedly with code ${code}`))
        this.active = null
      }

      // Reject all queued commands
      for (const item of this.queue) {
        clearTimeout(item.timer)
        item.reject(new Error(`Swift helper exited unexpectedly with code ${code}`))
      }
      this.queue = []

      this.emit('exit', code)

      // Attempt restart if not intentionally destroyed
      if (!this.destroyed) {
        this.attemptRestart()
      }
    })

    this.process.on('error', (err) => {
      console.error('[ax-reader] process error:', err)
      this.process = null

      if (this.active) {
        clearTimeout(this.active.timer)
        this.active.reject(err)
        this.active = null
      }

      for (const item of this.queue) {
        clearTimeout(item.timer)
        item.reject(err)
      }
      this.queue = []

      this.emit('error', err)
    })
  }

  private attemptRestart(): void {
    if (this.destroyed || this.restarting) return

    // If it's been a while since the last crash, this isn't a crash loop —
    // reset counter (handles sleep/wake recovery gracefully)
    const now = Date.now()
    if (this.lastCrashTime > 0 && now - this.lastCrashTime > RESTART_DECAY_MS) {
      this.restartCount = 0
    }
    this.lastCrashTime = now

    if (this.restartCount >= MAX_RESTART_ATTEMPTS) {
      console.error(`[ax-reader] Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached, giving up`)
      this.emit('fatal', new Error('Swift helper crashed too many times'))
      return
    }

    this.restarting = true
    this.restartCount++
    const delay = Math.min(RESTART_BACKOFF_MS * this.restartCount, RESTART_BACKOFF_CAP_MS)
    console.log(`[ax-reader] Restarting in ${delay}ms (attempt ${this.restartCount})`)

    setTimeout(() => {
      if (this.destroyed) return
      this.restarting = false
      try {
        this.spawnProcess()
        console.log('[ax-reader] Restarted successfully')
      } catch (err) {
        console.error('[ax-reader] Restart failed:', err)
        this.attemptRestart()
      }
    }, delay)
  }

  /** Reset restart counter — call after a successful command to signal health */
  private markHealthy(): void {
    this.restartCount = 0
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const response = JSON.parse(line) as SwiftResponse

        // Push events are unsolicited — route to EventEmitter, not command queue
        if (response.type === 'app-activated') {
          const event = response as AppActivatedResponse
          this.emit('app-activated', event.bundleId, event.pid)
          continue
        }

        if (!this.active) {
          console.warn('[ax-reader] Received response with no active command:', line.slice(0, 100))
          continue
        }

        clearTimeout(this.active.timer)

        if (response.type === 'error') {
          const err = response as { code: string; message: string }
          this.active.reject(new SwiftBridgeError(err.code, err.message))
        } else {
          this.markHealthy()
          this.active.resolve(response)
        }
        this.active = null
        this.drainQueue()
      } catch (e) {
        console.error('[ax-reader] Failed to parse JSON:', line, e)
      }
    }
  }

  private drainQueue(): void {
    if (this.active || this.queue.length === 0) return
    if (!this.process || !this.process.stdin || this.process.stdin.destroyed) return

    const next = this.queue.shift()!
    this.active = next

    try {
      const json = JSON.stringify(next.command) + '\n'
      this.process.stdin.write(json)
    } catch (err) {
      clearTimeout(next.timer)
      next.reject(err instanceof Error ? err : new Error(String(err)))
      this.active = null
      this.drainQueue()
    }
  }

  private sendCommand(command: object): Promise<SwiftResponse> {
    return new Promise((resolve, reject) => {
      if (this.destroyed) {
        reject(new Error('Swift bridge has been destroyed'))
        return
      }

      if (!this.process || !this.process.stdin || this.process.stdin.destroyed) {
        reject(new Error('Swift helper not running'))
        return
      }

      const timer = setTimeout(() => {
        // Remove from queue or clear active
        if (this.active && this.active.timer === timer) {
          this.active.reject(new Error('Command timed out'))
          this.active = null
          this.drainQueue()
        } else {
          const idx = this.queue.findIndex((q) => q.timer === timer)
          if (idx !== -1) {
            this.queue[idx].reject(new Error('Command timed out'))
            this.queue.splice(idx, 1)
          }
        }
      }, COMMAND_TIMEOUT_MS)

      const item: QueuedCommand = { command, resolve, reject, timer }

      if (this.active) {
        this.queue.push(item)
      } else {
        this.active = item
        try {
          const json = JSON.stringify(command) + '\n'
          this.process.stdin.write(json)
        } catch (err) {
          clearTimeout(timer)
          this.active = null
          reject(err instanceof Error ? err : new Error(String(err)))
        }
      }
    })
  }

  async listApps(): Promise<AppInfo[]> {
    const response = (await this.sendCommand({ command: 'list-apps' })) as AppsResponse
    return response.apps
  }

  async readConversation(pid: number): Promise<Conversation> {
    const response = (await this.sendCommand({
      command: 'read-conversation',
      pid,
    })) as ConversationResponse
    return {
      app: response.app,
      pid: response.pid,
      title: response.title,
      messages: response.messages,
    }
  }

  destroy(): void {
    this.destroyed = true

    // Reject everything pending
    if (this.active) {
      clearTimeout(this.active.timer)
      this.active.reject(new Error('Swift bridge destroyed'))
      this.active = null
    }
    for (const item of this.queue) {
      clearTimeout(item.timer)
      item.reject(new Error('Swift bridge destroyed'))
    }
    this.queue = []

    if (this.process) {
      this.process.stdin?.end()
      this.process.kill()
      this.process = null
    }
  }
}
