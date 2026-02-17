import { FC, useRef, useEffect, useState } from 'react'

interface VideoPreviewProps {
    filePath: string | null
    fileType: string
    fileName: string | null
    isLoading?: boolean
    autoPlayNext: boolean
    onToggleAutoPlay: () => void
    onNext: () => void
    onPrev: () => void
    onExtract: () => void
    navIndex: number
    navTotal: number
    onAddToQueue: () => void
    hasSelection: boolean
    onToggleQueue: () => void
    showQueue: boolean
    queueLength: number
    onEnded?: () => void
    triggerReplay?: number
}

export const VideoPreview: FC<VideoPreviewProps> = ({
    filePath,
    fileType,
    fileName,
    isLoading = false,
    autoPlayNext,
    onToggleAutoPlay,
    onNext,
    onPrev,
    onExtract,
    navIndex,
    navTotal,
    onAddToQueue,
    hasSelection,
    onToggleQueue,
    showQueue,
    queueLength,
    onEnded,
    triggerReplay
}) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        setError(false)
        if (videoRef.current) {
            videoRef.current.load()
        }
    }, [filePath])

    // Replay trigger
    useEffect(() => {
        if (triggerReplay && triggerReplay > 0) {
            if (videoRef.current) {
                videoRef.current.currentTime = 0
                videoRef.current.play().catch(console.error)
            }
            if (audioRef.current) {
                audioRef.current.currentTime = 0
                audioRef.current.play().catch(console.error)
            }
        }
    }, [triggerReplay])

    const handleEnded = () => {
        if (autoPlayNext) {
            if (onEnded) {
                onEnded()
            } else {
                onNext()
            }
        }
    }

    if (isLoading) {
        return (
            <div className="preview-panel">
                <div className="panel-loading">
                    <div className="spinner"></div>
                    <p>Loading preview...</p>
                </div>
            </div>
        )
    }

    if (!filePath) {
        return (
            <div className="preview-panel">
                <div className="preview-toolbar">
                    <span className="toolbar-title">Preview</span>
                    <div className="toolbar-actions">
                        <button
                            className={`icon-btn ${showQueue ? 'active' : ''}`}
                            onClick={onToggleQueue}
                            title="Toggle Play Queue"
                        >
                            ☰ {queueLength > 0 && <span className="queue-count">{queueLength}</span>}
                        </button>
                    </div>
                </div>
                <div className="panel-empty">
                    <span className="empty-icon-large">👁️</span>
                    <h3>Preview</h3>
                    <p>Select a file to preview</p>
                    <p className="hint-text">Use Arrow Keys to navigate · Ctrl+Click to multi-select</p>
                </div>
            </div>
        )
    }

    const currentPath = filePath
    const fileUrl = `local-file://${encodeURIComponent(currentPath.replace(/\\/g, '/'))}`

    const renderMedia = () => {
        if (fileType === 'video') {
            return (
                <video
                    ref={videoRef}
                    className="preview-video"
                    controls
                    autoPlay
                    onEnded={handleEnded}
                    onError={() => setError(true)}
                >
                    <source src={fileUrl} />
                    Your browser does not support this video format.
                </video>
            )
        }
        if (fileType === 'image') {
            return (
                <img
                    className="preview-image"
                    src={fileUrl}
                    alt={fileName || 'Preview'}
                    onError={() => setError(true)}
                />
            )
        }
        if (fileType === 'audio') {
            return (
                <div className="audio-player-wrapper">
                    <div className="audio-visual">
                        <span className="audio-icon">🎵</span>
                    </div>
                    <audio
                        controls
                        autoPlay
                        onEnded={handleEnded}
                        onError={() => setError(true)}
                    >
                        <source src={fileUrl} />
                    </audio>
                </div>
            )
        }
        return (
            <div className="preview-unsupported">
                <span className="empty-icon-large">📄</span>
                <p>Preview not available</p>
            </div>
        )
    }

    return (
        <div className="preview-panel">
            {/* Compact toolbar */}
            <div className="preview-toolbar">
                <div className="toolbar-left">
                    <span className="toolbar-title">Preview</span>
                    {navTotal > 0 && (
                        <span className="nav-counter">{navIndex + 1} / {navTotal}</span>
                    )}
                </div>
                <div className="toolbar-actions">
                    <label className="autoplay-toggle" title="Auto-play next">
                        <input
                            type="checkbox"
                            checked={autoPlayNext}
                            onChange={onToggleAutoPlay}
                        />
                        <span>Auto</span>
                    </label>
                    <div className="btn-group">
                        <button className="icon-btn" onClick={onPrev} title="Previous (↑)">◀</button>
                        <button className="icon-btn" onClick={onNext} title="Next (↓)">▶</button>
                    </div>
                    <button
                        className="icon-btn"
                        onClick={onAddToQueue}
                        disabled={!hasSelection}
                        title="Add to Queue"
                    >+Q</button>
                    <button
                        className={`icon-btn ${showQueue ? 'active' : ''}`}
                        onClick={onToggleQueue}
                        title="Toggle Play Queue"
                    >
                        ☰ {queueLength > 0 && <span className="queue-count">{queueLength}</span>}
                    </button>
                </div>
            </div>

            <div className="preview-content">
                <div className={`media-container type-${fileType}`}>
                    {renderMedia()}

                    {error && (
                        <div className="preview-error">
                            <span>⚠️</span>
                            <p>Error loading media</p>
                            <code>{currentPath}</code>
                        </div>
                    )}
                </div>
            </div>

            <div className="preview-footer">
                <div className="preview-info">
                    <span className="preview-filename" title={fileName || ''}>{fileName ? fileName.split('/').pop() : ''}</span>
                    <code className="preview-path">{fileName}</code>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={onExtract}>
                    ⬇ Extract
                </button>
            </div>
        </div>
    )
}
