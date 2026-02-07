import { app, shell, BrowserWindow, systemPreferences, screen, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import icon from '../../resources/icon.png?asset'
import { SwiftBridge, SwiftBridgeError } from './swift-bridge'
import { MessageDiffer } from './differ'
import { CharacterEngine } from './characters'
import { characters as presetCharacters } from '../characters'
import type { Message, AppSettings, CharacterConfig } from '../shared/types'

const bridge = new SwiftBridge()
const differ = new MessageDiffer()
let engine: CharacterEngine | null = null
let pollInterval: NodeJS.Timeout | null = null
let claudePid: number | null = null
let polling = false
let mainWindow: BrowserWindow | null = null
let positionInterval: NodeJS.Timeout | null = null

const store = new Store<AppSettings>({
  defaults: {
    activeCharacters: presetCharacters,
  },
})

// Track recent messages for context window
let recentMessages: Message[] = []
const MAX_RECENT = 8

function addToRecent(msgs: Message[]): void {
  recentMessages = [...recentMessages, ...msgs].slice(-MAX_RECENT)
}

function handleNewMessages(messages: Message[]): void {
  if (messages.length === 0) return

  addToRecent(messages)

  for (const msg of messages) {
    console.log(
      `[Differ] New message (${msg.role}): "${msg.text.slice(0, 80)}${msg.text.length > 80 ? '...' : ''}"`,
    )
  }

  // Generate commentary in the background — don't block the poll loop
  if (engine) {
    const lastMsg = messages[messages.length - 1]
    engine.generateCommentary(lastMsg, recentMessages).then((comments) => {
      for (const comment of comments) {
        console.log(`[${comment.characterName}] "${comment.text}"`)
        mainWindow?.webContents.send('comment:new', comment)
      }
    }).catch((err) => {
      console.error('[Commentary] Error:', err)
    })
  }
}

async function pollConversation(): Promise<void> {
  if (!claudePid || polling) return
  polling = true

  try {
    const conversation = await bridge.readConversation(claudePid)
    const newMessages = differ.diff(conversation.title, conversation.messages)

    if (newMessages.length > 0) {
      handleNewMessages(newMessages)
    }
  } catch (err) {
    if (err instanceof SwiftBridgeError) {
      console.warn(`[Poll] AX error (${err.code}): ${err.message}`)
    } else {
      console.error('[Poll] Unexpected error:', err)
    }
  } finally {
    polling = false
  }
}

function positionOverlayBesideClaude(): void {
  if (!mainWindow || !claudePid) return

  try {
    const primaryDisplay = screen.getPrimaryDisplay()
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize
    const { x: workX, y: workY } = primaryDisplay.workArea

    const overlayWidth = 380
    const overlayHeight = 600

    // Position at the right edge of the screen
    const x = workX + screenWidth - overlayWidth - 8
    const y = workY + Math.round((screenHeight - overlayHeight) / 2)

    mainWindow.setBounds({ x, y, width: overlayWidth, height: overlayHeight })
  } catch (err) {
    console.warn('[Position] Error positioning overlay:', err)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    positionOverlayBesideClaude()
    mainWindow!.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Re-check position periodically
  positionInterval = setInterval(positionOverlayBesideClaude, 5000)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function startAccessibilityReader(): Promise<void> {
  const isTrusted = systemPreferences.isTrustedAccessibilityClient(true)
  console.log(`[PeanutGallery] Accessibility trusted: ${isTrusted}`)

  // Initialize character engine — check both process.env and electron-vite's import.meta.env
  const apiKey = import.meta.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.warn('[PeanutGallery] ANTHROPIC_API_KEY not set — commentary disabled')
  } else {
    engine = new CharacterEngine(apiKey, store.get('activeCharacters'))
    console.log('[PeanutGallery] Character engine initialized')
  }

  try {
    await bridge.start()
    console.log('[PeanutGallery] Swift bridge started')

    const apps = await bridge.listApps()
    const claudeApp = apps.find((a) => a.bundleIdentifier === 'com.anthropic.claudefordesktop')
    if (!claudeApp) {
      console.log('[PeanutGallery] Claude Desktop not found among running apps')
      return
    }

    claudePid = claudeApp.pid
    console.log(`[PeanutGallery] Found Claude Desktop (PID ${claudePid})`)

    // Wire up settled-message callback (debounced assistant messages)
    differ.onMessageSettled((msg) => {
      handleNewMessages([msg])
    })

    // Start polling
    pollInterval = setInterval(pollConversation, 3000)
    console.log('[PeanutGallery] Polling started (3s interval)')

    // Do an initial poll immediately
    await pollConversation()
  } catch (err) {
    if (
      err instanceof SwiftBridgeError &&
      (err.code === 'no_window' || err.code === 'no_webarea' || err.code === 'no_main_content')
    ) {
      console.error(`[PeanutGallery] AX navigation failed (${err.code}): ${err.message}`)
      console.error(
        '[PeanutGallery] This may mean accessibility permission is not working for the child process.',
      )
      console.error(
        '[PeanutGallery] Try: Remove Electron.app from Accessibility settings, restart app, re-add when prompted.',
      )
    } else {
      console.error('[PeanutGallery] Error:', err)
    }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.peanutgallery.app')

  // Register IPC handlers
  ipcMain.handle('settings:get', (): AppSettings => {
    return {
      activeCharacters: store.get('activeCharacters'),
    }
  })

  ipcMain.handle('settings:set', (_event, settings: AppSettings): void => {
    store.set('activeCharacters', settings.activeCharacters)
    if (engine) {
      engine.setCharacters(settings.activeCharacters)
    }
  })

  ipcMain.handle('characters:get-presets', (): CharacterConfig[] => {
    return presetCharacters
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  startAccessibilityReader()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
  if (positionInterval) {
    clearInterval(positionInterval)
    positionInterval = null
  }
  differ.destroy()
  bridge.destroy()
})
