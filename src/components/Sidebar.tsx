import { FC } from 'react'
import type { ArchiveInfo } from '../stores'

interface SidebarProps {
    folderPath: string | null
    archives: ArchiveInfo[]
    selectedArchive: ArchiveInfo | null
    onSelectFolder: () => void
    onSelectArchive: (archive: ArchiveInfo) => void
    onShowKeyInput: () => void
    encryptionKey: string
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const Sidebar: FC<SidebarProps> = ({
    folderPath,
    archives,
    selectedArchive,
    onSelectFolder,
    onSelectArchive,
    onShowKeyInput,
    encryptionKey,
}) => {
    return (
        <aside className="sidebar">
            {/* Logo / Header */}
            <div className="sidebar-header">
                <div className="logo">
                    <span className="logo-icon">🎬</span>
                    <div>
                        <h1 className="logo-title">RPA Extractor</h1>
                        <span className="logo-subtitle">Ren'Py Scene Tool</span>
                    </div>
                </div>
            </div>

            {/* Folder Selection */}
            <div className="sidebar-section">
                <button className="btn btn-primary btn-full" onClick={onSelectFolder}>
                    <span className="btn-icon">📂</span>
                    Select Game Folder
                </button>

                {folderPath && (
                    <div className="folder-path" title={folderPath}>
                        <span className="path-icon">📁</span>
                        <span className="path-text">{folderPath}</span>
                    </div>
                )}
            </div>

            {/* Encryption Key */}
            <div className="sidebar-section">
                <button
                    className={`btn btn-secondary btn-full ${encryptionKey ? 'btn-active' : ''}`}
                    onClick={onShowKeyInput}
                >
                    <span className="btn-icon">{encryptionKey ? '🔓' : '🔒'}</span>
                    {encryptionKey ? 'Key Set' : 'Encryption Key'}
                </button>
            </div>

            {/* Archive List */}
            <div className="sidebar-section sidebar-archives">
                <h2 className="section-title">
                    Archives
                    {archives.length > 0 && (
                        <span className="section-badge">{archives.length}</span>
                    )}
                </h2>

                {archives.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">📦</span>
                        <p>No archives loaded</p>
                        <p className="empty-hint">Select a Ren'Py game folder to begin</p>
                    </div>
                ) : (
                    <ul className="archive-list">
                        {archives.map((archive) => (
                            <li
                                key={archive.path}
                                className={`archive-item ${selectedArchive?.path === archive.path ? 'active' : ''}`}
                                onClick={() => onSelectArchive(archive)}
                            >
                                <span className="archive-icon">📦</span>
                                <div className="archive-info">
                                    <span className="archive-name">{archive.name}</span>
                                    <span className="archive-meta">
                                        {formatSize(archive.size)} · {archive.relative}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </aside>
    )
}
