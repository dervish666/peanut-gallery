import { app } from 'electron'
import { mkdirSync, createWriteStream, WriteStream } from 'fs'
import { join } from 'path'

let stream: WriteStream | null = null

function getLogPath(): string {
  const logDir = join(app.getPath('logs'))
  mkdirSync(logDir, { recursive: true })
  return join(logDir, 'main.log')
}

function timestamp(): string {
  return new Date().toISOString()
}

export function initLogger(): string {
  const logPath = getLogPath()
  stream = createWriteStream(logPath, { flags: 'a' })
  stream.write(`\n--- Peanut Gallery started at ${timestamp()} ---\n`)

  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error

  console.log = (...args: unknown[]) => {
    const line = args.map(String).join(' ')
    stream?.write(`${timestamp()} [LOG] ${line}\n`)
    origLog.apply(console, args)
  }

  console.warn = (...args: unknown[]) => {
    const line = args.map(String).join(' ')
    stream?.write(`${timestamp()} [WARN] ${line}\n`)
    origWarn.apply(console, args)
  }

  console.error = (...args: unknown[]) => {
    const line = args.map(String).join(' ')
    stream?.write(`${timestamp()} [ERROR] ${line}\n`)
    origError.apply(console, args)
  }

  return logPath
}
