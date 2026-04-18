import { FC, useRef, useEffect, useState } from 'react'
import { buildLocalFileUrl } from './timeline/mediaUtils'

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
    previewSource: 'selection' | 'queue'
    navigationTarget: 'files' | 'queue'
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
    previewSource,
    navigationTarget,
    onEnded,
    triggerReplay
}) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const [error, setError] = useState(false)
    const navigationLabel = navigationTarget === 'queue' && queueLength > 0 ? 'Queue' : 'Files'
    const previewSourceLabel = previewSource === 'queue' ? 'Queue item' : 'File selection'
    const fileLabel = fileName ? fileName.split('/').pop() : ''

    useEffect(() => {
        setError(false)
        if (videoRef.current) {
            videoRef.current.load()
        }
        if (audioRef.current) {
            audioRef.current.load()
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

    const renderToolbar = () => (
        <div className="preview-toolbar">
            <div className="preview-toolbar-main">
                <div className="preview-title-row">
                    <span className="toolbar-title">Preview</span>
                    <span className={`preview-source-badge ${previewSource === 'queue' ? 'is-queue' : 'is-files'}`}>
                        {previewSourceLabel}
                    </span>
                    {navTotal > 0 && (
                        <span className="nav-counter">{navIndex + 1} / {navTotal}</span>
                    )}
                </div>
                <p className="preview-toolbar-hint">
                    Arrow keys target <strong>{navigationLabel}</strong>
                </p>
            </div>

            <div className="preview-toolbar-actions">
                <label className={`autoplay-toggle ${autoPlayNext ? 'enabled' : ''}`} title="Auto-play next preview item">
                    <input
                        type="checkbox"
                        checked={autoPlayNext}
                        onChange={onToggleAutoPlay}
                    />
                    <span>Auto-play next</span>
                </label>

                <div className="preview-nav-group" role="group" aria-label="Preview navigation">
                    <button className="btn btn-secondary btn-sm preview-nav-btn" onClick={onPrev} title="Previous (↑ / ←)">
                        ← Prev
                    </button>
                    <button className="btn btn-secondary btn-sm preview-nav-btn" onClick={onNext} title="Next (↓ / →)">
                        Next →
                    </button>
                </div>

                <button
                    className="btn btn-secondary btn-sm preview-toolbar-btn"
                    onClick={onAddToQueue}
                    disabled={!hasSelection}
                    title="Add the current selection to the queue"
                >
                    + Queue
                </button>

                <button
                    className={`btn btn-secondary btn-sm preview-toolbar-btn ${showQueue ? 'btn-active' : ''}`}
                    onClick={onToggleQueue}
                    title="Show or hide the play queue"
                >
                    Queue
                    {queueLength > 0 && <span className="queue-count">{queueLength}</span>}
                </button>
            </div>
        </div>
    )

    if (isLoading) {
        return (
            <div className="preview-panel">
                {renderToolbar()}
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
                {renderToolbar()}
                <div className="panel-empty">
                    <span className="empty-icon-large">👁️</span>
                    <h3>Preview</h3>
                    <p>Select a file to preview</p>
                    <p className="hint-text">Arrow keys follow your last file or queue interaction · Ctrl+Click to multi-select</p>
                </div>
            </div>
        )
    }

    const currentPath = filePath
    const fileUrl = buildLocalFileUrl(currentPath)

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
                        ref={audioRef}
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
            {renderToolbar()}

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
                    <div className="preview-info-row">
                        <span className="preview-filename" title={fileName || ''}>{fileLabel}</span>
                        <span className={`preview-type-badge type-${fileType}`}>{fileType}</span>
                    </div>
                    <code className="preview-path">{fileName}</code>
                </div>
                <button className="btn btn-secondary btn-sm preview-extract-btn" onClick={onExtract}>
                    ⬇ Extract
                </button>
            </div>
        </div>
    )
}
