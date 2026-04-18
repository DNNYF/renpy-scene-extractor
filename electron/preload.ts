import { ipcRenderer, contextBridge } from 'electron'

// Typed API exposed to the renderer process
const api = {
  /** Open a native folder selection dialog */
  selectFolder: (): Promise<{ success: boolean; canceled?: boolean; path?: string }> => {
    return ipcRenderer.invoke('select-folder')
  },

  /** Scan a folder recursively for .rpa files */
  scanFolder: (folderPath: string): Promise<{
    success: boolean
    archives?: Array<{ path: string; name: string; size: number; relative: string }>
    error?: string
  }> => {
    return ipcRenderer.invoke('scan-folder', folderPath)
  },

  /** List contents of an RPA archive */
  listArchive: (archivePath: string, key?: string): Promise<{
    success: boolean
    version?: string
    totalFiles?: number
    files?: Array<{ name: string; size: number; type: string; parts: number }>
    error?: string
  }> => {
    return ipcRenderer.invoke('list-archive', archivePath, key)
  },

  /** Extract a single file for preview or export */
  extractFile: (archivePath: string, filename: string, key?: string, outputDir?: string, outputFilename?: string): Promise<{
    success: boolean
    outputPath?: string
    type?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('extract-file', archivePath, filename, key, outputDir, outputFilename)
  },

  /** Extract all files from an archive */
  extractAll: (archivePath: string, outputDir: string, key?: string, filterType?: string): Promise<{
    success: boolean
    outputDir?: string
    extractedCount?: number
    error?: string
  }> => {
    return ipcRenderer.invoke('extract-all', archivePath, outputDir, key, filterType)
  },

  /** Open a native folder selection dialog for output */
  selectOutputFolder: (): Promise<{ success: boolean; canceled?: boolean; path?: string }> => {
    return ipcRenderer.invoke('select-output-folder')
  },

  /** Import external media file (video/audio/image) for timeline editor */
  importMedia: (): Promise<{
    success: boolean
    filePath?: string
    fileName?: string
    type?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('import-media')
  },

  exportTimeline: (project: Record<string, unknown>): Promise<{
    success: boolean
    canceled?: boolean
    outputPath?: string
    error?: string
  }> => {
    return ipcRenderer.invoke('export-timeline', project)
  },
}

contextBridge.exposeInMainWorld('api', api)

// Type declaration for the renderer
export type ApiType = typeof api
