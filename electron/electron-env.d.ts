/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  api: {
    selectFolder: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>
    scanFolder: (folderPath: string) => Promise<{ success: boolean; archives?: any[]; error?: string }>
    listArchive: (archivePath: string, key?: string) => Promise<{ success: boolean; files?: any[]; error?: string }>
    extractFile: (archivePath: string, filename: string, key?: string, outputDir?: string) => Promise<{ success: boolean; outputPath?: string; error?: string }>
    extractAll: (archivePath: string, outputDir: string, key?: string, filterType?: string) => Promise<{ success: boolean; extractedCount?: number; error?: string }>
    selectOutputFolder: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>
    importMedia: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; fileName?: string; type?: string }>
  }
}
