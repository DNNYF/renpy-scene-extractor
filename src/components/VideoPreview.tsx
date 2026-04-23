import { ChangeEvent, FC, KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useRef, useState } from 'react'
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
    imageSequenceFrameDuration?: number | null
}

function formatPlaybackTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00'
    }

    const wholeSeconds = Math.floor(seconds)
    const hours = Math.floor(wholeSeconds / 3600)
    const minutes = Math.floor((wholeSeconds % 3600) / 60)
    const remainingSeconds = wholeSeconds % 60

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    }

    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
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
    triggerReplay,
    imageSequenceFrameDuration = null,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)
    const playerShellRef = useRef<HTMLDivElement>(null)
    const centerControlTimeoutRef = useRef<number | null>(null)
    const imageSequenceTimeoutRef = useRef<number | null>(null)

    const [error, setError] = useState(false)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [volume, setVolume] = useState(1)
    const [isMuted, setIsMuted] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [isCenterControlVisible, setIsCenterControlVisible] = useState(true)

    const navigationLabel = navigationTarget === 'queue' && queueLength > 0 ? 'Queue' : 'Files'
    const previewSourceLabel = previewSource === 'queue' ? 'Queue item' : 'File selection'
    const fileLabel = fileName ? fileName.split('/').pop() : ''
    const isPlayableMedia = fileType === 'video' || fileType === 'audio'
    const isAnimatedImage = fileType === 'image' && Number.isFinite(imageSequenceFrameDuration) && (imageSequenceFrameDuration ?? 0) > 0

    const clearCenterControlTimeout = useCallback(() => {
        if (centerControlTimeoutRef.current !== null) {
            window.clearTimeout(centerControlTimeoutRef.current)
            centerControlTimeoutRef.current = null
        }
    }, [])

    const clearImageSequenceTimeout = useCallback(() => {
        if (imageSequenceTimeoutRef.current !== null) {
            window.clearTimeout(imageSequenceTimeoutRef.current)
            imageSequenceTimeoutRef.current = null
        }
    }, [])

    const getMediaElement = useCallback((): HTMLMediaElement | null => {
        if (fileType === 'video') {
            return videoRef.current
        }

        if (fileType === 'audio') {
            return audioRef.current
        }

        return null
    }, [fileType])

    const syncMediaState = useCallback((mediaElement: HTMLMediaElement | null) => {
        if (!mediaElement) {
            setIsPlaying(false)
            setCurrentTime(0)
            setDuration(0)
            return
        }

        setIsPlaying(!mediaElement.paused && !mediaElement.ended)
        setCurrentTime(mediaElement.currentTime || 0)
        setDuration(Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0)
        setVolume(mediaElement.volume)
        setIsMuted(mediaElement.muted)
    }, [])

    useEffect(() => {
        setError(false)
        setCurrentTime(0)
        setDuration(0)
        setIsCenterControlVisible(true)
        clearCenterControlTimeout()

        const mediaElement = getMediaElement()
        if (!mediaElement) {
            setIsPlaying(false)
            return
        }

        mediaElement.load()
        syncMediaState(mediaElement)
    }, [clearCenterControlTimeout, filePath, fileType, getMediaElement, syncMediaState])

    useEffect(() => {
        const mediaElement = getMediaElement()
        if (!mediaElement) {
            return
        }

        mediaElement.volume = volume
        mediaElement.muted = isMuted
    }, [getMediaElement, isMuted, volume])

    useEffect(() => {
        if (!triggerReplay || triggerReplay <= 0) {
            return
        }

        const mediaElement = getMediaElement()
        if (!mediaElement) {
            return
        }

        mediaElement.currentTime = 0
        mediaElement.play().catch(console.error)
    }, [getMediaElement, triggerReplay])

    useEffect(() => {
        const handleFullscreenChange = () => {
            const shell = playerShellRef.current
            const fullscreenElement = document.fullscreenElement
            setIsFullscreen(Boolean(shell && fullscreenElement && (shell === fullscreenElement || shell.contains(fullscreenElement))))
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [])

    const scheduleCenterControlHide = useCallback(() => {
        clearCenterControlTimeout()

        const mediaElement = getMediaElement()
        if (!isPlayableMedia || !mediaElement || mediaElement.paused || mediaElement.ended) {
            return
        }

        centerControlTimeoutRef.current = window.setTimeout(() => {
            setIsCenterControlVisible(false)
            centerControlTimeoutRef.current = null
        }, 2000)
    }, [clearCenterControlTimeout, getMediaElement, isPlayableMedia])

    const revealCenterControl = useCallback(() => {
        if (!isPlayableMedia || error) {
            return
        }

        setIsCenterControlVisible(true)
        scheduleCenterControlHide()
    }, [error, isPlayableMedia, scheduleCenterControlHide])

    useEffect(() => {
        if (!isPlayableMedia || error || !isPlaying) {
            setIsCenterControlVisible(true)
            clearCenterControlTimeout()
            return
        }

        scheduleCenterControlHide()
        return clearCenterControlTimeout
    }, [clearCenterControlTimeout, error, isPlayableMedia, isPlaying, scheduleCenterControlHide])

    useEffect(() => {
        if (!isFullscreen) {
            return
        }

        playerShellRef.current?.focus({ preventScroll: true })
        revealCenterControl()
    }, [isFullscreen, revealCenterControl])

    useEffect(() => {
        return () => {
            clearCenterControlTimeout()
            clearImageSequenceTimeout()
        }
    }, [clearCenterControlTimeout, clearImageSequenceTimeout])

    useEffect(() => {
        clearImageSequenceTimeout()

        if (!isAnimatedImage || !autoPlayNext || !onEnded) {
            return
        }

        const frameDuration = imageSequenceFrameDuration ?? 0
        if (frameDuration <= 0) {
            return
        }

        imageSequenceTimeoutRef.current = window.setTimeout(() => {
            onEnded()
        }, frameDuration * 1000)

        return clearImageSequenceTimeout
    }, [autoPlayNext, clearImageSequenceTimeout, imageSequenceFrameDuration, isAnimatedImage, onEnded, triggerReplay, filePath])

    const handleEnded = useCallback(() => {
        setIsPlaying(false)

        if (!autoPlayNext) {
            return
        }

        if (onEnded) {
            onEnded()
            return
        }

        onNext()
    }, [autoPlayNext, onEnded, onNext])

    const togglePlayback = useCallback(() => {
        const mediaElement = getMediaElement()
        if (!mediaElement) {
            return
        }

        if (mediaElement.paused || mediaElement.ended) {
            mediaElement.play().catch(console.error)
            return
        }

        mediaElement.pause()
    }, [getMediaElement])

    const handleSeek = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const mediaElement = getMediaElement()
        if (!mediaElement) {
            return
        }

        const nextTime = Number(event.target.value)
        mediaElement.currentTime = nextTime
        setCurrentTime(nextTime)
    }, [getMediaElement])

    const handleVolumeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
        const mediaElement = getMediaElement()
        const nextVolume = Number(event.target.value)

        setVolume(nextVolume)

        if (!mediaElement) {
            return
        }

        mediaElement.volume = nextVolume
        mediaElement.muted = nextVolume === 0
        setIsMuted(mediaElement.muted)
    }, [getMediaElement])

    const toggleMute = useCallback(() => {
        const mediaElement = getMediaElement()
        if (!mediaElement) {
            return
        }

        mediaElement.muted = !mediaElement.muted
        setIsMuted(mediaElement.muted)
    }, [getMediaElement])

    const toggleFullscreen = useCallback(async () => {
        const playerShell = playerShellRef.current
        if (!playerShell) {
            return
        }

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen()
            } else {
                await playerShell.requestFullscreen()
            }
        } catch (fullscreenError) {
            console.error('Failed to toggle fullscreen', fullscreenError)
        }
    }, [])

    const handlePlayerActivity = useCallback(() => {
        revealCenterControl()
    }, [revealCenterControl])

    const handlePlayerShellKeyDown = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
        if (!isFullscreen) {
            return
        }

        if (
            event.target instanceof HTMLInputElement
            || event.target instanceof HTMLTextAreaElement
            || event.target instanceof HTMLSelectElement
            || (event.target instanceof HTMLElement && event.target.isContentEditable)
        ) {
            return
        }

        const normalizedKey = event.key.toLowerCase()

        if (event.key === 'ArrowLeft' || normalizedKey === 'a') {
            event.preventDefault()
            event.stopPropagation()
            handlePlayerActivity()
            onPrev()
            return
        }

        if (event.key === 'ArrowRight' || normalizedKey === 'd') {
            event.preventDefault()
            event.stopPropagation()
            handlePlayerActivity()
            onNext()
        }
    }, [handlePlayerActivity, isFullscreen, onNext, onPrev])

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
                        Arrow keys target <strong>{navigationLabel}</strong> · Fullscreen player accepts <strong>← / → / A / D</strong>
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
                    autoPlay
                    playsInline
                    onLoadedMetadata={(event) => syncMediaState(event.currentTarget)}
                    onDurationChange={(event) => syncMediaState(event.currentTarget)}
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onVolumeChange={(event) => {
                        setVolume(event.currentTarget.volume)
                        setIsMuted(event.currentTarget.muted)
                    }}
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
                    <div className="audio-player-copy">
                        <span className="audio-player-title">Audio preview</span>
                        <span className="audio-player-caption">Custom transport stays visible while queue scenes advance.</span>
                    </div>
                    <audio
                        ref={audioRef}
                        autoPlay
                        onLoadedMetadata={(event) => syncMediaState(event.currentTarget)}
                        onDurationChange={(event) => syncMediaState(event.currentTarget)}
                        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onVolumeChange={(event) => {
                            setVolume(event.currentTarget.volume)
                            setIsMuted(event.currentTarget.muted)
                        }}
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
                <div
                    className={`media-container type-${fileType} ${isFullscreen ? 'is-fullscreen' : ''}`}
                    ref={playerShellRef}
                    tabIndex={0}
                    onPointerMove={handlePlayerActivity}
                    onPointerDown={handlePlayerActivity}
                    onFocusCapture={handlePlayerActivity}
                    onKeyDownCapture={handlePlayerShellKeyDown}
                >
                    <button
                        type="button"
                        className="player-nav-zone is-prev"
                        onClick={onPrev}
                        title="Previous scene"
                        aria-label="Go to previous scene"
                    >
                        <span className="player-nav-zone-label">← Prev</span>
                    </button>

                    <div className={`player-media-frame ${isFullscreen ? 'is-fullscreen' : ''}`}>
                        {renderMedia()}

                        {isPlayableMedia && !error && (
                            <button
                                type="button"
                                className={`player-center-control ${isPlaying ? 'is-playing' : ''} ${isCenterControlVisible ? '' : 'is-hidden'}`.trim()}
                                onClick={togglePlayback}
                                aria-label={isPlaying ? 'Pause preview playback' : 'Play preview playback'}
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                        )}

                        {error && (
                            <div className="preview-error">
                                <span>⚠️</span>
                                <p>Error loading media</p>
                                <code>{currentPath}</code>
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        className="player-nav-zone is-next"
                        onClick={onNext}
                        title="Next scene"
                        aria-label="Go to next scene"
                    >
                        <span className="player-nav-zone-label">Next →</span>
                    </button>

                    <div className="player-control-bar">
                        <div className="player-primary-controls">
                            {isPlayableMedia ? (
                                <button
                                    type="button"
                                    className="player-control-btn"
                                    onClick={togglePlayback}
                                    title={isPlaying ? 'Pause preview' : 'Play preview'}
                                >
                                    {isPlaying ? '⏸ Pause' : '▶ Play'}
                                </button>
                            ) : (
                                <span className="player-static-label">{isAnimatedImage ? 'Image sequence' : 'Image preview'}</span>
                            )}

                            <button
                                type="button"
                                className="player-control-btn is-secondary"
                                onClick={toggleFullscreen}
                                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                            >
                                {isFullscreen ? '🡼 Window' : '⛶ Fullscreen'}
                            </button>
                        </div>

                        {isPlayableMedia ? (
                            <>
                                <div className="player-timeline-control">
                                    <span className="player-timecode">{formatPlaybackTime(currentTime)}</span>
                                    <input
                                        type="range"
                                        className="player-seek-slider"
                                        min={0}
                                        max={Math.max(duration, 0.01)}
                                        step={0.05}
                                        value={Math.min(currentTime, Math.max(duration, 0.01))}
                                        onChange={handleSeek}
                                        aria-label="Seek preview playback"
                                    />
                                    <span className="player-timecode">{formatPlaybackTime(duration)}</span>
                                </div>

                                <div className="player-volume-control">
                                    <button
                                        type="button"
                                        className="player-control-btn is-secondary"
                                        onClick={toggleMute}
                                        title={isMuted || volume === 0 ? 'Unmute preview' : 'Mute preview'}
                                    >
                                        {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
                                    </button>
                                    <input
                                        type="range"
                                        className="player-volume-slider"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        value={isMuted ? 0 : volume}
                                        onChange={handleVolumeChange}
                                        aria-label="Preview volume"
                                    />
                                </div>
                            </>
                        ) : (
                            <div className="player-static-spacer" />
                        )}
                    </div>
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
