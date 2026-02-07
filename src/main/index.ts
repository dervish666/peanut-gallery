import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { SwiftBridge, SwiftBridgeError } from './swift-bridge'

const bridge = new SwiftBridge()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function startAccessibilityReader(): Promise<void> {
  try {
    await bridge.start()
    console.log('[PeanutGallery] Swift bridge started')

    // List running apps
    const apps = await bridge.listApps()
    console.log('[PeanutGallery] Running apps:', JSON.stringify(apps, null, 2))

    // Look for Claude Desktop
    const claudeApp = apps.find((a) => a.bundleIdentifier === 'com.anthropic.claudefordesktop')
    if (!claudeApp) {
      console.log('[PeanutGallery] Claude Desktop not found among running apps')
      return
    }

    console.log(`[PeanutGallery] Found Claude Desktop (PID ${claudeApp.pid}), reading conversation...`)

    // Read the current conversation
    const conversation = await bridge.readConversation(claudeApp.pid)
    console.log('[PeanutGallery] Conversation:', JSON.stringify(conversation, null, 2))
  } catch (err) {
    if (err instanceof SwiftBridgeError && err.code === 'accessibility_denied') {
      console.error('[PeanutGallery] Accessibility permission denied')
      dialog.showMessageBox({
        type: 'warning',
        title: 'Accessibility Permission Required',
        message:
          'Peanut Gallery needs Accessibility permission to read chat conversations.\n\n' +
          'Please go to System Settings → Privacy & Security → Accessibility and grant permission to Peanut Gallery.',
        buttons: ['Open System Settings', 'Later'],
        defaultId: 0
      }).then((result) => {
        if (result.response === 0) {
          shell.openExternal(
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
          )
        }
      })
    } else {
      console.error('[PeanutGallery] Error:', err)
    }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.peanutgallery.app')

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
  bridge.destroy()
})
