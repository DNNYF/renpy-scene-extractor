import { FC, useEffect, useRef, useState } from 'react'
import { FixedSizeList as VList, ListChildComponentProps } from 'react-window'

interface RpaFile {
    name: string
    size: number
    type: 'video' | 'image' | 'audio' | 'other'
    parts: number
}

type FilterType = 'all' | 'video' | 'image' | 'audio'
type ViewMode = 'list' | 'grid'

interface FileListProps {
    files: RpaFile[]
    totalFiles: number
    selectedFile: RpaFile | null
    selectedFiles: RpaFile[]
    archiveVersion: string
    filterType: FilterType
    viewMode: ViewMode
    onFilterChange: (filter: FilterType) => void
    onViewModeChange: (mode: ViewMode) => void
    onSelectFile: (file: RpaFile, e: React.MouseEvent) => void
    onExtractAll: () => void
    onExtractSelected: () => void
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
    return path.split('/').pop() || path
}

const ITEM_HEIGHT = 44

interface RowData {
    files: RpaFile[]
    selectedFile: RpaFile | null
    selectedFiles: RpaFile[]
    onSelectFile: (file: RpaFile, e: React.MouseEvent) => void
}

// Virtualized list row renderer
const FileRow: FC<ListChildComponentProps<RowData>> = ({ index, style, data }) => {
    const { files, selectedFile, selectedFiles, onSelectFile } = data
    const file = files[index]
    if (!file) return null

    const isActive = selectedFile?.name === file.name
    const isQueued = selectedFiles.some(f => f.name === file.name)

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
    hasArchive,
    extracting = false,
    searchQuery = '',
    onSearchChange,
}) => {
    const listRef = useRef<VList<RowData>>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [containerHeight, setContainerHeight] = useState(600)

    // Measure container height
    useEffect(() => {
        if (!containerRef.current) return
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
            const idx = files.findIndex(f => f.name === selectedFile.name)
            if (idx >= 0) {
                listRef.current.scrollToItem(idx, 'smart')
            }
        }
    }, [selectedFile, files, viewMode])

    const itemData: RowData = {
        files,
        selectedFile,
        selectedFiles,
        onSelectFile,
    }

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
                        <h2 className="panel-title">
                            Files
                            <span className="panel-badge">{files.length} / {totalFiles}</span>
                        </h2>
                        {archiveVersion && (
                            <span className="version-badge">RPA-{archiveVersion}</span>
                        )}
                    </div>

                    <div className="panel-tools">
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

                {/* Actions — separate row */}
                <div className="actions-row">
                    <span className="actions-hint">
                        {selectedFiles.length > 0
                            ? `${selectedFiles.length} selected`
                            : 'Ctrl+Click / Q to queue'}
                    </span>
                    <div className="action-group">
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={onExtractSelected}
                            disabled={!selectedFile || extracting}
                            title="Extract selected file"
                        >⬇ Selected</button>
                        <button
                            className="btn btn-accent btn-sm"
                            onClick={onExtractAll}
                            disabled={extracting}
                        >⬇ All</button>
                    </div>
                </div>
            </div>

            {/* File List — Virtualized */}
            <div className="file-list-scroll" ref={containerRef}>
                {files.length === 0 ? (
                    <div className="panel-empty">
                        <span className="empty-icon-large">🔍</span>
                        <p>No files match the current filter</p>
                    </div>
                ) : viewMode === 'list' ? (
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
                ) : (
                    /* Grid view — show first 200 for perf */
                    <ul className="file-list mode-grid">
                        {files.slice(0, 200).map((file) => {
                            const isActive = selectedFile?.name === file.name
                            const isQueued = selectedFiles.some(f => f.name === file.name)
                            return (
                                <li
                                    key={file.name}
                                    className={`file-item ${isActive ? 'active' : ''} ${isQueued ? 'queued' : ''} file-type-${file.type}`}
                                    onClick={(e) => onSelectFile(file, e)}
                                    tabIndex={0}
                                >
                                    <div className="file-icon-wrapper">
                                        <span className="file-icon">{TYPE_ICONS[file.type] || '📄'}</span>
                                    </div>
                                    <div className="file-info">
                                        <span className="file-name" title={file.name}>{getFileName(file.name)}</span>
                                    </div>
                                    <div className="file-meta">
                                        <span className="file-size">{formatSize(file.size)}</span>
                                    </div>
                                    {isQueued && <span className="queue-indicator">●</span>}
                                </li>
                            )
                        })}
                    </ul>
                )}
            </div>
        </div>
    )
}
