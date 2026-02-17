// Type declarations for the preload API
interface RpaArchive {
    path: string
    name: string
    size: number
    relative: string
}

interface RpaFile {
    name: string
    size: number
    type: 'video' | 'image' | 'audio' | 'other'
    parts: number
}

interface ApiResult<T = unknown> {
    success: boolean
    error?: string
    canceled?: boolean
    [key: string]: unknown
}

interface ElectronApi {
    selectFolder(): Promise<{ success: boolean; canceled?: boolean; path?: string }>
    scanFolder(folderPath: string): Promise<{ success: boolean; archives?: RpaArchive[]; error?: string }>
    listArchive(archivePath: string, key?: string): Promise<{
        success: boolean
        version?: string
        totalFiles?: number
        files?: RpaFile[]
        error?: string
    }>
    extractFile(archivePath: string, filename: string, key?: string, outputDir?: string): Promise<{
        success: boolean
        outputPath?: string
        type?: string
        error?: string
    }>
    extractAll(archivePath: string, outputDir: string, key?: string, filterType?: string): Promise<{
        success: boolean
        outputDir?: string
        extractedCount?: number
        error?: string
    }>
    selectOutputFolder(): Promise<{ success: boolean; canceled?: boolean; path?: string }>
    importMedia(): Promise<{ success: boolean; canceled?: boolean; filePath?: string; fileName?: string; type?: string }>
}

declare global {
    interface Window {
        api: ElectronApi
    }
}

export { }
