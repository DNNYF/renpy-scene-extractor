import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { spawn, ChildProcess } from 'node:child_process'
import fs from 'node:fs'


const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
let pythonProcess: ChildProcess | null = null
let requestId = 0
const pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>()

// --- Python Process Management ---

function getPythonScriptPath(): string {
  // In dev: python/rpa_tool.py relative to APP_ROOT
  // In production: resources/python/rpa_tool.py
  const devPath = path.join(process.env.APP_ROOT!, 'python', 'rpa_tool.py')
  if (fs.existsSync(devPath)) return devPath

  const prodPath = path.join(process.resourcesPath, 'python', 'rpa_tool.py')
  if (fs.existsSync(prodPath)) return prodPath

  return devPath // fallback
}

function startPython(): ChildProcess {
  if (pythonProcess && !pythonProcess.killed) {
    return pythonProcess
  }

  const scriptPath = getPythonScriptPath()
  pythonProcess = spawn('python', [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  })

  let buffer = ''

  pythonProcess.stdout?.on('data', (data: Buffer) => {
    buffer += data.toString('utf-8')
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const response = JSON.parse(line)
        // Find the oldest pending request and resolve it
        const entries = [...pendingRequests.entries()]
        if (entries.length > 0) {
          const [id, { resolve }] = entries[0]
          pendingRequests.delete(id)
          resolve(response)
        }
      } catch {
        console.error('[Python stdout parse error]:', line)
      }
    }
  })

  pythonProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[Python stderr]:', data.toString())
  })

  pythonProcess.on('exit', (code) => {
    console.log(`[Python] exited with code ${code}`)
    pythonProcess = null
    // Reject all pending requests
    for (const [, { reject }] of pendingRequests) {
      reject(new Error(`Python process exited with code ${code}`))
    }
    pendingRequests.clear()
  })

  return pythonProcess
}

function sendPythonCommand(command: string, params: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const proc = startPython()
    const id = ++requestId
    pendingRequests.set(id, { resolve, reject })

    const msg = JSON.stringify({ command, params }) + '\n'
    proc.stdin?.write(msg, (err) => {
      if (err) {
        pendingRequests.delete(id)
        reject(err)
      }
    })

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id)
        reject(new Error('Python command timed out'))
      }
    }, 30000)
  })
}

// --- IPC Handlers ---

function registerIpcHandlers() {
  // Select folder dialog
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Select Ren\'Py Game Folder',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    return { success: true, path: result.filePaths[0] }
  })

  // Scan folder for .rpa files
  ipcMain.handle('scan-folder', async (_event, folderPath: string) => {
    return sendPythonCommand('scan', { path: folderPath })
  })

  // List contents of an RPA archive
  ipcMain.handle('list-archive', async (_event, archivePath: string, key?: string) => {
    return sendPythonCommand('list', { path: archivePath, key })
  })

  // Extract a single file (for preview or export)
  ipcMain.handle('extract-file', async (_event, archivePath: string, filename: string, key?: string, outputDir?: string, outputFilename?: string) => {
    const targetDir = outputDir || path.join(app.getPath('temp'), 'rpa-extractor')
    return sendPythonCommand('extract', {
      path: archivePath,
      filename,
      key,
      outputDir: targetDir,
      outputFilename,
    })
  })

  // Extract all files (optionally filtered)
  ipcMain.handle('extract-all', async (_event, archivePath: string, outputDir: string, key?: string, filterType?: string) => {
    return sendPythonCommand('extractAll', {
      path: archivePath,
      key,
      outputDir,
      filterType,
    })
  })

  // Select output folder for extraction
  ipcMain.handle('select-output-folder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Output Folder',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }
    return { success: true, path: result.filePaths[0] }
  })

  // Import external media file for timeline editor
  ipcMain.handle('import-media', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      title: 'Import Media File',
      filters: [
        { name: 'Media Files', extensions: ['mp4', 'webm', 'avi', 'mkv', 'mov', 'mp3', 'wav', 'ogg', 'flac', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
        { name: 'Video', extensions: ['mp4', 'webm', 'avi', 'mkv', 'mov'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac'] },
        { name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const filePath = result.filePaths[0]
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const fileName = path.basename(filePath)

    let fileType = 'other'
    if (['mp4', 'webm', 'avi', 'mkv', 'mov'].includes(ext)) fileType = 'video'
    else if (['mp3', 'wav', 'ogg', 'flac'].includes(ext)) fileType = 'audio'
    else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) fileType = 'image'

    return {
      success: true,
      filePath,
      fileName,
      type: fileType,
    }
  })
}

// --- Menu ---

function createMenu() {
  const template: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Select Game Folder',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (win) {
              win.webContents.send('menu-select-folder')
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Report Bug',
      click: async () => {
        await shell.openExternal('https://github.com/DNNYF/renpy-scene-extractor')
      }
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// --- Window Creation ---

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Ren\'Py Scene Extractor',
    backgroundColor: '#0a0a0f',
    titleBarStyle: 'hiddenInset',
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow loading local files for video preview
    },
  })

  // Register custom protocol for serving extracted files
  win.webContents.session.protocol.registerFileProtocol('local-file', (request, callback) => {
    const filePath = decodeURIComponent(request.url.replace('local-file://', ''))
    callback({ path: filePath })
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// --- App Lifecycle ---

app.on('window-all-closed', () => {
  // Kill Python process on exit
  if (pythonProcess && !pythonProcess.killed) {
    pythonProcess.kill()
  }
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  if (!await checkDependencies()) {
    app.quit()
    return
  }
  createMenu()
  registerIpcHandlers()
  createWindow()
})

function checkDependencies(): Promise<boolean> {
  return new Promise((resolve) => {
    // We only check for python existence, not unrpa since we use custom parser
    const python = spawn('python', ['--version'])

    python.on('error', () => {
      dialog.showErrorBox('Error', 'Python is not installed or not in PATH.')
      resolve(false)
    })

    python.on('close', (code) => {
      if (code !== 0) {
        dialog.showErrorBox('Error', 'Python check failed.')
        resolve(false)
        return
      }
      resolve(true)
    })
  })
}
