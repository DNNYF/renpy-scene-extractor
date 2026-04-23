import { FC, useEffect, useRef, useState } from 'react'
import { FixedSizeList as VList, ListChildComponentProps } from 'react-window'
import type { ArchiveFile } from '../stores'

type FilterType = 'all' | 'video' | 'image' | 'audio'
type ViewMode = 'list' | 'grid'

interface FileListProps {
    files: ArchiveFile[]
    totalFiles: number
    selectedFile: ArchiveFile | null
    selectedFiles: ArchiveFile[]
    archiveVersion: string
    filterType: FilterType
    viewMode: ViewMode
    onFilterChange: (filter: FilterType) => void
    onViewModeChange: (mode: ViewMode) => void
    onSelectFile: (file: ArchiveFile, e: React.MouseEvent) => void
    onExtractAll: () => void
    onExtractSelected: () => void
    onQueueSelected: () => void
    onOpenHelp: () => void
    hasArchive: boolean
    extracting?: boolean
    searchQuery?: string
    onSearchChange?: (query: string) => void
}

const TYPE_ICONS: Record<string, string> = {
    video: '🎬',
    image: '🖼️',
    audio: '🎵',
    other: '📄',
}

const FILTER_OPTIONS: { value: FilterType; label: string; icon: string }[] = [
    { value: 'all', label: 'All', icon: '📋' },
    { value: 'video', label: 'Video', icon: '🎬' },
    { value: 'image', label: 'Image', icon: '🖼️' },
    { value: 'audio', label: 'Audio', icon: '🎵' },
]

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function getFileName(path: string): string {
    return path.split('/').pop()?.split('\\').pop() || path
}

const ITEM_HEIGHT = 44

interface RowData {
    files: ArchiveFile[]
    selectedFile: ArchiveFile | null
    selectedFiles: ArchiveFile[]
    onSelectFile: (file: ArchiveFile, e: React.MouseEvent) => void
}

// Virtualized list row renderer
const FileRow: FC<ListChildComponentProps<RowData>> = ({ index, style, data }) => {
    const { files, selectedFile, selectedFiles, onSelectFile } = data
    const file = files[index]
    if (!file) return null

    const isActive = selectedFile?.path === file.path
    const isQueued = selectedFiles.some(f => f.path === file.path)

    return (
        <div style={style}>
            <div
                className={`file-item ${isActive ? 'active' : ''} ${isQueued ? 'queued' : ''} file-type-${file.type}`}
                onClick={(e) => onSelectFile(file, e)}
                tabIndex={0}
                data-filename={file.name}
            >
                <div className="file-icon-wrapper">
                    <span className="file-icon">{TYPE_ICONS[file.type] || '📄'}</span>
                </div>
                <div className="file-info">
                    <span className="file-name" title={file.name}>{getFileName(file.name)}</span>
                    <span className="file-path">{file.name}</span>
                </div>
                <div className="file-meta">
                    <span className="file-size">{formatSize(file.size)}</span>
                    <span className={`file-type-badge type-${file.type}`}>{file.type}</span>
                </div>
                {isQueued && <span className="queue-indicator">●</span>}
            </div>
        </div>
    )
}

export const FileList: FC<FileListProps> = ({
    files,
    totalFiles,
    selectedFile,
    selectedFiles,
    archiveVersion,
    filterType,
    viewMode,
    onFilterChange,
    onViewModeChange,
    onSelectFile,
    onExtractAll,
    onExtractSelected,
    onQueueSelected,
    onOpenHelp,
    hasArchive,
    extracting = false,
    searchQuery = '',
    onSearchChange,
}) => {
    const listRef = useRef<VList<RowData>>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [containerHeight, setContainerHeight] = useState(600)
    const [showActions, setShowActions] = useState(false)
    const canUseVirtualList = viewMode === 'list' && containerHeight >= ITEM_HEIGHT * 2

    // Measure container height
    useEffect(() => {
        if (!containerRef.current) return
        setContainerHeight(containerRef.current.getBoundingClientRect().height)
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setContainerHeight(entry.contentRect.height)
            }
        })
        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    // Scroll to active item when selectedFile changes
    useEffect(() => {
        if (selectedFile && listRef.current && viewMode === 'list') {
            const idx = files.findIndex(f => f.path === selectedFile.path)
            if (idx >= 0) {
                listRef.current.scrollToItem(idx, 'smart')
            }
        }
    }, [selectedFile, files, viewMode])

    useEffect(() => {
        if (selectedFiles.length > 0) {
            setShowActions(true)
        }
    }, [selectedFiles.length])

    const itemData: RowData = {
        files,
        selectedFile,
        selectedFiles,
        onSelectFile,
    }

    const renderPlainList = () => (
        <ul className="file-list mode-list mode-list-fallback">
            {files.map((file) => {
                const isActive = selectedFile?.path === file.path
                const isQueued = selectedFiles.some((f) => f.path === file.path)

                return (
                    <li key={file.path}>
                        <div
                            className={`file-item ${isActive ? 'active' : ''} ${isQueued ? 'queued' : ''} file-type-${file.type}`}
                            onClick={(e) => onSelectFile(file, e)}
                            tabIndex={0}
                            data-filename={file.name}
                        >
                            <div className="file-icon-wrapper">
                                <span className="file-icon">{TYPE_ICONS[file.type] || '📄'}</span>
                            </div>
                            <div className="file-info">
                                <span className="file-name" title={file.name}>{getFileName(file.name)}</span>
                                <span className="file-path">{file.name}</span>
                            </div>
                            <div className="file-meta">
                                <span className="file-size">{formatSize(file.size)}</span>
                                <span className={`file-type-badge type-${file.type}`}>{file.type}</span>
                            </div>
                            {isQueued && <span className="queue-indicator">●</span>}
                        </div>
                    </li>
                )
            })}
        </ul>
    )

    if (!hasArchive) {
        return (
            <div className="file-list-panel">
                <div className="panel-empty">
                    <span className="empty-icon-large">📦</span>
                    <h3>Select an Archive</h3>
                    <p>Choose a game folder and select an .rpa archive to view its contents</p>
                </div>
            </div>
        )
    }

    return (
        <div className="file-list-panel">
            {/* Header */}
            <div className="panel-header">
                <div className="panel-top-row">
                    <div className="panel-title-group">
                        <div className="panel-title-stack">
                            <div className="panel-title-row">
                                <h2 className="panel-title">Files</h2>
                                <span className="panel-badge">{files.length} / {totalFiles}</span>
                                {archiveVersion && (
                                    <span className="version-badge">RPA-{archiveVersion}</span>
                                )}
                            </div>
                            <p className="panel-subtitle">Browse and extract archive contents</p>
                        </div>
                    </div>

                    <div className="panel-tools">
                        <span className="panel-tools-label">View</span>
                        <div className="view-toggles">
                            <button
                                className={`icon-btn ${viewMode === 'list' ? 'active' : ''}`}
                                onClick={() => onViewModeChange('list')}
                                title="List View"
                            >☰</button>
                            <button
                                className={`icon-btn ${viewMode === 'grid' ? 'active' : ''}`}
                                onClick={() => onViewModeChange('grid')}
                                title="Grid View"
                            >⊞</button>
                        </div>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="filter-section">
                    {onSearchChange && (
                        <div className="search-box">
                            <span className="search-icon">🔍</span>
                            <input
                                type="text"
                                placeholder="Search files..."
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="search-input"
                            />
                            {searchQuery && (
                                <button
                                    className="search-clear"
                                    onClick={() => onSearchChange('')}
                                >✕</button>
                            )}
                        </div>
                    )}
                    <div className="filter-toolbar">
                        <span className="filter-toolbar-label">Filter</span>
                        <div className="filter-row">
                            {FILTER_OPTIONS.map(opt => (
                                <button
                                    key={opt.value}
                                    className={`filter-btn ${filterType === opt.value ? 'active' : ''}`}
                                    onClick={() => onFilterChange(opt.value)}
                                >
                                    <span className="filter-icon">{opt.icon}</span>
                                    <span className="filter-label">{opt.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className={`actions-row ${selectedFiles.length > 0 ? 'has-selection' : 'is-idle'} ${showActions ? 'is-expanded' : 'is-collapsed'}`}>
                    <div className="actions-summary">
                        <div className="actions-status" aria-live="polite">
                            <span className="actions-status-eyebrow">Selection</span>
                            <span className="actions-status-label">
                                {selectedFiles.length > 0
                                    ? `${selectedFiles.length} selected`
                                    : showActions ? 'No files selected' : 'Selection tools hidden'}
                            </span>
                            <span className="actions-status-hint">
                                {selectedFiles.length > 0
                                    ? 'Ctrl+Click or Shift+Click to refine, then queue or extract in one step.'
                                    : 'Use the action tray for queue, extract, and shortcut help.'}
                            </span>
                        </div>

                        <div className="actions-summary-buttons">
                            <button
                                className="btn btn-secondary btn-sm action-help-btn"
                                onClick={onOpenHelp}
                                title="Show help and keyboard shortcuts"
                            >❔ Help</button>
                            <button
                                type="button"
                                className={`btn btn-secondary btn-sm actions-toggle ${showActions ? 'is-open' : ''}`}
                                onClick={() => setShowActions((prev) => !prev)}
                                aria-expanded={showActions}
                                title={showActions ? 'Collapse selection tools' : 'Expand selection tools'}
                            >
                                {showActions ? '▾ Hide actions' : '▸ Show actions'}
                            </button>
                        </div>
                    </div>

                    {showActions && (
                        <div className="actions-groups">
                            <div className="action-group-block">
                                <span className="action-group-label">Selected</span>
                                <div className="action-group action-group-selection">
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={onQueueSelected}
                                        disabled={selectedFiles.length === 0}
                                        title="Import all selected files to play queue"
                                    >+Q Queue</button>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        onClick={onExtractSelected}
                                        disabled={selectedFiles.length === 0 || extracting}
                                        title="Extract all selected files"
                                    >⬇ Extract Selected</button>
                                </div>
                            </div>
                            <div className="action-group-block action-group-block-primary">
                                <span className="action-group-label">Current view</span>
                                <div className="action-group action-group-primary">
                                    <button
                                        className="btn btn-accent btn-sm"
                                        onClick={onExtractAll}
                                        disabled={extracting}
                                        title="Extract all files in the current tab/filter"
                                    >⬇ Extract All</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* File List — Virtualized */}
            <div className={`file-list-scroll ${viewMode === 'list' ? 'mode-list-host' : 'mode-grid-host'}`} ref={containerRef}>
                {files.length === 0 ? (
                    <div className="panel-empty">
                        <span className="empty-icon-large">🔍</span>
                        <p>No files match the current filter</p>
                    </div>
                ) : canUseVirtualList ? (
                    <VList
                        ref={listRef}
                        height={containerHeight}
                        width="100%"
                        itemCount={files.length}
                        itemSize={ITEM_HEIGHT}
                        itemData={itemData}
                        overscanCount={10}
                        className="file-list mode-list"
                    >
                        {FileRow}
                    </VList>
                ) : viewMode === 'list' ? (
                    renderPlainList()
                ) : (
                    /* Grid view — show first 200 for perf */
                    <ul className="file-list mode-grid">
                        {files.slice(0, 200).map((file) => {
                            const isActive = selectedFile?.path === file.path
                            const isQueued = selectedFiles.some(f => f.path === file.path)
                            return (
                                <li
                                    key={file.path}
                                    className={`file-item ${isActive ? 'active' : ''} ${isQueued ? 'queued' : ''} file-type-${file.type}`}
                                    onClick={(e) => onSelectFile(file, e)}
                                    tabIndex={0}
                                >
                                    <div className="grid-item-top">
                                        <div className="file-icon-wrapper">
                                            <span className="file-icon">{TYPE_ICONS[file.type] || '📄'}</span>
                                        </div>
                                        {isQueued && <span className="grid-queue-indicator">Queued</span>}
                                    </div>
                                    <div className="file-info">
                                        <span className="file-name" title={file.name}>{getFileName(file.name)}</span>
                                        <span className="file-path" title={file.name}>{file.name}</span>
                                    </div>
                                    <div className="file-meta">
                                        <span className="file-size">{formatSize(file.size)}</span>
                                        <span className={`file-type-badge type-${file.type}`}>{file.type}</span>
                                    </div>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
