import { FC } from 'react'
import type { ArchiveInfo } from '../stores'

interface SidebarProps {
    archives: ArchiveInfo[]
    selectedArchive: ArchiveInfo | null
    collapsed: boolean
    onSelectFolder: () => void
    onSelectArchive: (archive: ArchiveInfo) => void
    onRemoveArchive: (archivePath: string) => void
    onShowKeyInput: () => void
    onToggleCollapse: () => void
    encryptionKey: string
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export const Sidebar: FC<SidebarProps> = ({
    archives,
    selectedArchive,
    collapsed,
    onSelectFolder,
    onSelectArchive,
    onRemoveArchive,
    onShowKeyInput,
    onToggleCollapse,
    encryptionKey,
}) => {
    const loadedArchiveCount = archives.filter((archive) => archive.files.length > 0).length

    return (
        <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <button
                    type="button"
                    className="logo sidebar-toggle-brand"
                    onClick={onToggleCollapse}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <span className="logo-icon">🎬</span>
                    {!collapsed && (
                        <div>
                            <h1 className="logo-title">RPA Extractor</h1>
                            <span className="logo-subtitle">Ren'Py Scene Tool</span>
                        </div>
                    )}
                </button>
            </div>

            <div className="sidebar-section sidebar-actions">
                <button
                    className="btn btn-primary btn-full sidebar-action-btn"
                    onClick={onSelectFolder}
                    title="Select a Ren'Py game folder"
                >
                    <span className="btn-icon">📂</span>
                    {!collapsed && 'Select Game Folder'}
                </button>

                <button
                    className={`btn btn-secondary btn-full sidebar-action-btn ${encryptionKey ? 'btn-active' : ''}`}
                    onClick={onShowKeyInput}
                    title={encryptionKey ? 'Update encryption key' : 'Set encryption key'}
                >
                    <span className="btn-icon">{encryptionKey ? '🔓' : '🔒'}</span>
                    {!collapsed && (encryptionKey ? 'Key Set' : 'Encryption Key')}
                </button>
            </div>

            {!collapsed && (
                <div className="sidebar-section sidebar-dashboard">
                    <div className="sidebar-summary-card">
                        <div className="sidebar-summary-header">
                            <span className="sidebar-summary-title">Workspace</span>
                            <span className="sidebar-summary-chip">{archives.length} loaded</span>
                        </div>

                        <div className="sidebar-metrics">
                            <div className="sidebar-metric">
                                <span className="sidebar-metric-value">{loadedArchiveCount}</span>
                                <span className="sidebar-metric-label">Indexed</span>
                            </div>
                            <div className="sidebar-metric">
                                <span className="sidebar-metric-value">{selectedArchive?.files.length ?? 0}</span>
                                <span className="sidebar-metric-label">Visible Files</span>
                            </div>
                        </div>

                        <p className="sidebar-summary-caption">
                            {selectedArchive
                                ? `${selectedArchive.name} is active${selectedArchive.files.length > 0 ? ` · ${selectedArchive.files.length} files ready` : ' · click to load contents'}`
                                : 'Pick an archive to browse files, preview media, or extract assets.'}
                        </p>
                    </div>

                </div>
            )}

            <div className="sidebar-section sidebar-archives">
                <div className="section-title">
                    <span>{collapsed ? '📦' : 'Archives'}</span>
                    {!collapsed && archives.length > 0 && (
                        <span className="section-badge">{archives.length}</span>
                    )}
                </div>

                {archives.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">📦</span>
                        {!collapsed && (
                            <>
                                <p>No archives loaded</p>
                                <p className="empty-hint">Select a Ren'Py game folder to begin</p>
                            </>
                        )}
                    </div>
                ) : (
                    <ul className="archive-list">
                        {archives.map((archive) => {
                            const isActive = selectedArchive?.path === archive.path
                            const archiveLabel = `${archive.name} · ${formatSize(archive.size)}`
                            const filesLabel = archive.files.length > 0
                                ? `${archive.files.length} indexed files`
                                : 'Click to load archive contents'

                            return (
                                <li
                                    key={archive.path}
                                    className={`archive-item ${isActive ? 'active' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="archive-button"
                                        onClick={() => onSelectArchive(archive)}
                                        title={`${archive.name}\n${archive.relative || archive.path}`}
                                    >
                                        <span className="archive-icon">📦</span>
                                        {!collapsed && (
                                            <div className="archive-info">
                                                <div className="archive-name-row">
                                                    <span className="archive-name">{archive.name}</span>
                                                    {isActive && <span className="archive-state-badge">Open</span>}
                                                </div>
                                                <div className="archive-meta-row">
                                                    <span className="archive-stat">{filesLabel}</span>
                                                    <span className="archive-stat">{archiveLabel}</span>
                                                </div>
                                                <span className="archive-meta">{archive.relative || archive.path}</span>
                                            </div>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        className="archive-remove"
                                        onClick={(event) => {
                                            event.stopPropagation()
                                            onRemoveArchive(archive.path)
                                        }}
                                        title={`Remove ${archive.name}`}
                                        aria-label={`Remove ${archive.name}`}
                                    >
                                        ✕
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </aside>
    )
}
