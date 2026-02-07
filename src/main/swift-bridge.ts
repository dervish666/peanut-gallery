import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { EventEmitter } from 'events'
import { is } from '@electron-toolkit/utils'
import type {
  SwiftResponse,
  AppsResponse,
  ConversationResponse,
  AppInfo,
  Conversation
} from '../shared/types'

export class SwiftBridgeError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message)
    this.name = 'SwiftBridgeError'
  }
}

export class SwiftBridge extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer: string = ''
  private pendingResolve: ((response: SwiftResponse) => void) | null = null
  private pendingReject: ((error: Error) => void) | null = null

  private getBinaryPath(): string {
    if (is.dev) {
      return join(process.cwd(), 'resources', 'ax-reader')
    }
    return join(process.resourcesPath, 'ax-reader')
  }

  async start(): Promise<void> {
    const binaryPath = this.getBinaryPath()
    this.process = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    this.process.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.process.stderr!.on('data', (data: Buffer) => {
      console.error('[ax-reader stderr]', data.toString())
    })

    this.process.on('exit', (code) => {
      console.log(`[ax-reader] exited with code ${code}`)
      if (this.pendingReject) {
        this.pendingReject(new Error(`Swift helper exited unexpectedly with code ${code}`))
        this.pendingResolve = null
        this.pendingReject = null
      }
      this.emit('exit', code)
    })

    this.process.on('error', (err) => {
      console.error('[ax-reader] process error:', err)
      if (this.pendingReject) {
        this.pendingReject(err)
        this.pendingResolve = null
        this.pendingReject = null
      }
      this.emit('error', err)
    })
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const response = JSON.parse(line) as SwiftResponse
        if (response.type === 'error' && this.pendingReject) {
          const err = response as { code: string; message: string }
          this.pendingReject(new SwiftBridgeError(err.code, err.message))
          this.pendingResolve = null
          this.pendingReject = null
        } else if (this.pendingResolve) {
          this.pendingResolve(response)
          this.pendingResolve = null
          this.pendingReject = null
        }
      } catch (e) {
        console.error('[ax-reader] Failed to parse JSON:', line, e)
      }
    }
  }

  private sendCommand(command: object): Promise<SwiftResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('Swift helper not started'))
        return
      }
      this.pendingResolve = resolve
      this.pendingReject = reject
      const json = JSON.stringify(command) + '\n'
      this.process.stdin.write(json)
    })
  }

  async listApps(): Promise<AppInfo[]> {
    const response = (await this.sendCommand({ command: 'list-apps' })) as AppsResponse
    return response.apps
  }

  async readConversation(pid: number): Promise<Conversation> {
    const response = (await this.sendCommand({
      command: 'read-conversation',
      pid
    })) as ConversationResponse
    return {
      app: response.app,
      pid: response.pid,
      title: response.title,
      messages: response.messages
    }
  }

  destroy(): void {
    if (this.process) {
      this.process.stdin?.end()
      this.process.kill()
      this.process = null
    }
  }
}
