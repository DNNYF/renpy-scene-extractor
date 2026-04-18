import { FC, useState, useRef } from 'react'
import type { QueueItem } from '../stores'

interface PlayQueueProps {
    queue: QueueItem[]
    currentIndex: number
    onMoveItem: (fromIndex: number, toIndex: number) => void
    onPlay: (index: number) => void
    onRemove: (index: number) => void
    onClear: () => void
    onPlayAll: () => void
    onExtractQueue: () => void
    onOpenEditor: () => void
    onUpdateQueueItem: (index: number, updates: Partial<QueueItem>) => void
    onInteract: () => void
    extracting?: boolean
}

function getFileName(path: string): string {
    return path.split('/').pop()?.split('\\').pop() || path
}

const TYPE_ICONS: Record<string, string> = {
    video: '🎬',
    image: '🖼️',
    audio: '🎵',
    other: '📄',
}

export const PlayQueue: FC<PlayQueueProps> = ({
    queue,
    currentIndex,
    onMoveItem,
    onPlay,
    onRemove,
    onClear,
    onPlayAll,
    onExtractQueue,
    onOpenEditor,
    onUpdateQueueItem,
    onInteract,
    extracting = false,
}) => {
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [overIndex, setOverIndex] = useState<number | null>(null)
    const dragNode = useRef<HTMLLIElement | null>(null)
    const activeQueueItem = currentIndex >= 0 ? queue[currentIndex] ?? null : null

    const handleDragStart = (e: React.DragEvent, index: number) => {
        onInteract()
        setDragIndex(index)
        dragNode.current = e.currentTarget as HTMLLIElement
        e.dataTransfer.effectAllowed = 'move'
        setTimeout(() => {
            if (dragNode.current) dragNode.current.style.opacity = '0.4'
        }, 0)
    }

    const handleDragEnd = () => {
        if (dragNode.current) dragNode.current.style.opacity = '1'
        if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
            onMoveItem(dragIndex, overIndex)
        }
        setDragIndex(null)
        setOverIndex(null)
        dragNode.current = null
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOverIndex(index)
    }

    if (queue.length === 0) {
        return (
            <div className="play-queue" onMouseDownCapture={onInteract} onFocusCapture={onInteract}>
                <div className="queue-header">
                    <div className="queue-header-main">
                        <div className="queue-title-row">
                            <h3 className="queue-title">
                                Play Queue
                                <span className="queue-badge">0</span>
                            </h3>
                        </div>
                    </div>
                </div>
                <div className="queue-empty">
                    <span>Ctrl+Click or press Q to add files, then drag to reorder or set loops per item.</span>
                </div>
            </div>
        )
    }

    return (
        <div className="play-queue" onMouseDownCapture={onInteract} onFocusCapture={onInteract}>
            <div className="queue-header">
                <div className="queue-header-main">
                    <div className="queue-title-row">
                        <h3 className="queue-title">
                            Play Queue
                            <span className="queue-badge">{queue.length}</span>
                        </h3>
                        {activeQueueItem && <span className="queue-current-chip">Now playing</span>}
                    </div>
                </div>
                <div className="queue-actions">
                    <button
                        className="btn btn-accent btn-sm"
                        onClick={onPlayAll}
                        title="Play all from start"
                    >▶ Play All</button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onExtractQueue}
                        disabled={extracting}
                        title="Extract all queued files"
                    >{extracting ? '⏳' : '⬇'} Extract</button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={onOpenEditor}
                        title="Open in Timeline Editor"
                    >🎞 Editor</button>
                    <button className="btn btn-secondary btn-sm" onClick={onClear}>
                        ✕ Clear
                    </button>
                </div>
            </div>
            <ul className="queue-list">
                {queue.map((file, index) => (
                    <li
                        key={file.id}
                        className={`queue-item ${index === currentIndex ? 'playing' : ''} ${overIndex === index ? 'drag-over' : ''}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnd={handleDragEnd}
                        onDragOver={(e) => handleDragOver(e, index)}
                    >
                        <span className="queue-drag-handle" title="Drag to reorder">⠿</span>
                        <div className="queue-row-main">
                            <button
                                className={`queue-play-btn ${index === currentIndex ? 'active' : ''}`}
                                onClick={() => onPlay(index)}
                                title="Play this item"
                            >
                                {index === currentIndex ? '⏸' : '▶'}
                            </button>
                            <span className="queue-icon">{TYPE_ICONS[file.type] || '📄'}</span>
                            <div className="queue-info">
                                <div className="queue-name-row">
                                    <span className="queue-index">#{index + 1}</span>
                                    <button
                                        className="queue-name"
                                        type="button"
                                        title={file.name}
                                        onClick={() => onPlay(index)}
                                    >
                                        {getFileName(file.name)}
                                    </button>
                                    {index === currentIndex && <span className="queue-state-badge">Active</span>}
                                </div>
                                <div className="queue-meta-row">
                                    <span className={`queue-item-type type-${file.type}`}>{file.type}</span>
                                    <span className="queue-path" title={file.name}>{file.name}</span>
                                </div>
                            </div>
                            <div className="queue-row-controls">
                                <label className="queue-loop-control">
                                    <span className="loop-label">Loops</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="99"
                                        value={Math.max(1, file.loopCount)}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value) || 1
                                            onUpdateQueueItem(index, { loopCount: Math.max(1, val) })
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="loop-input"
                                    />
                                </label>
                                <button
                                    className="queue-remove"
                                    onClick={(e) => { e.stopPropagation(); onRemove(index) }}
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
