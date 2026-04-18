/// <reference types="vite/client" />

interface ElectronApi {
    selectFolder: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
    scanFolder: (folderPath: string) => Promise<{
        success: boolean;
        archives?: Array<{ path: string; name: string; size: number; relative: string }>;
        error?: string;
    }>;
    listArchive: (archivePath: string, key?: string) => Promise<{
        success: boolean;
        version?: string;
        totalFiles?: number;
        files?: Array<{ name: string; size: number; type: string; parts: number }>;
        error?: string;
    }>;
    extractFile: (archivePath: string, filename: string, key?: string, outputDir?: string) => Promise<{
        success: boolean;
        outputPath?: string;
        type?: string;
        error?: string;
    }>;
    extractAll: (archivePath: string, outputDir: string, key?: string, filterType?: string) => Promise<{
        success: boolean;
        outputDir?: string;
        extractedCount?: number;
        error?: string;
    }>;
    selectOutputFolder: () => Promise<{ success: boolean; canceled?: boolean; path?: string }>;
    importMedia: () => Promise<{ success: boolean; canceled?: boolean; filePath?: string; fileName?: string; type?: string }>;
}

declare global {
    interface Window {
        api: ElectronApi
    }
}

