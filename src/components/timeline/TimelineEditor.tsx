import { FC, useState, useRef, useCallback, useEffect, useMemo } from 'react'

/* ===================================================
   Types & Interfaces
   =================================================== */

interface RpaFile {
    name: string
    size: number
    type: 'video' | 'image' | 'audio' | 'other'
    parts: number
}

export interface TimelineClip {
    id: string
    fileName: string
    filePath: string   // local file path for playback
    fileType: 'video' | 'image' | 'audio' | 'other'
    trackId: string
    startTime: number  // seconds offset on timeline
    duration: number   // seconds
    trimStart: number  // trim from beginning (seconds)
    trimEnd: number    // trim from end (seconds)
}

interface Track {
    id: string
    type: 'video' | 'audio'
    label: string
    clips: TimelineClip[]
}

interface TimelineEditorProps {
    initialClips: { file: RpaFile; path: string }[]
    onBack: () => void
}

/* ===================================================
   Utilities
   =================================================== */

let clipIdCounter = 0
function generateClipId(): string {
    return `clip-${Date.now()}-${++clipIdCounter}`
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 10)
    return `${m}:${String(s).padStart(2, '0')}.${ms}`
}

function getFileName(path: string): string {
    return path.split('/').pop()?.split('\\').pop() || path
}

const DEFAULT_IMG_DURATION = 5 // seconds
const MIN_ZOOM = 10  // px per second
const MAX_ZOOM = 200

/* ===================================================
   TimelineEditor — Main Container
   =================================================== */

export const TimelineEditor: FC<TimelineEditorProps> = ({ initialClips, onBack }) => {
    // --- State ---
    const [tracks, setTracks] = useState<Track[]>(() => {
        // Create initial tracks from queue items
        const videoClips: TimelineClip[] = []
        const audioClips: TimelineClip[] = []
        let videoOffset = 0
        let audioOffset = 0

        for (const item of initialClips) {
            const defaultDur = item.file.type === 'image' ? DEFAULT_IMG_DURATION : 10
            const clip: TimelineClip = {
                id: generateClipId(),
                fileName: item.file.name,
                filePath: item.path,
                fileType: item.file.type,
                trackId: item.file.type === 'audio' ? 'audio-1' : 'video-1',
                startTime: item.file.type === 'audio' ? audioOffset : videoOffset,
                duration: defaultDur,
                trimStart: 0,
                trimEnd: 0,
            }
            if (item.file.type === 'audio') {
                clip.trackId = 'audio-1'
                audioClips.push(clip)
                audioOffset += defaultDur
            } else {
                clip.trackId = 'video-1'
                videoClips.push(clip)
                videoOffset += defaultDur
            }
        }

        return [
            { id: 'video-1', type: 'video', label: 'Video 1', clips: videoClips },
            { id: 'audio-1', type: 'audio', label: 'Audio 1', clips: audioClips },
        ]
    })

    const [playheadTime, setPlayheadTime] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [zoom, setZoom] = useState(50) // px per second
    const [scrollLeft, setScrollLeft] = useState(0)
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null)

    // Refs
    const timelineRef = useRef<HTMLDivElement>(null)
    const animFrameRef = useRef<number>(0)
    const lastTimeRef = useRef<number>(0)
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)

    // --- Derived ---
    const totalDuration = useMemo(() => {
        let max = 30 // minimum 30 seconds
        for (const track of tracks) {
            for (const clip of track.clips) {
                const end = clip.startTime + clip.duration - clip.trimStart - clip.trimEnd
                if (end > max) max = end
            }
        }
        return max + 10 // add some padding
    }, [tracks])

    const timelineWidth = totalDuration * zoom

    // Find active clip at playhead for a given track type
    const getActiveClip = useCallback((type: 'video' | 'audio'): TimelineClip | null => {
        for (const track of tracks) {
            if (track.type !== type) continue
            for (const clip of track.clips) {
                const effectiveEnd = clip.startTime + clip.duration - clip.trimStart - clip.trimEnd
                if (playheadTime >= clip.startTime && playheadTime < effectiveEnd) {
                    return clip
                }
            }
        }
        return null
    }, [tracks, playheadTime])

    const activeVideoClip = getActiveClip('video')
    const activeAudioClip = getActiveClip('audio')

    // --- Playback ---
    const startPlayback = useCallback(() => {
        setIsPlaying(true)
        lastTimeRef.current = performance.now()

        const animate = (now: number) => {
            const delta = (now - lastTimeRef.current) / 1000
            lastTimeRef.current = now
            setPlayheadTime(prev => {
                const next = prev + delta
                if (next >= totalDuration) {
                    setIsPlaying(false)
                    return 0
                }
                return next
            })
            animFrameRef.current = requestAnimationFrame(animate)
        }
        animFrameRef.current = requestAnimationFrame(animate)
    }, [totalDuration])

    const stopPlayback = useCallback(() => {
        setIsPlaying(false)
        cancelAnimationFrame(animFrameRef.current)
    }, [])

    const togglePlayback = useCallback(() => {
        if (isPlaying) {
            stopPlayback()
        } else {
            startPlayback()
        }
    }, [isPlaying, startPlayback, stopPlayback])

    // Cleanup on unmount
    useEffect(() => {
        return () => cancelAnimationFrame(animFrameRef.current)
    }, [])

    // --- Update video/audio elements to match playhead ---
    useEffect(() => {
        if (videoRef.current && activeVideoClip) {
            const clipTime = playheadTime - activeVideoClip.startTime + activeVideoClip.trimStart
            if (Math.abs(videoRef.current.currentTime - clipTime) > 0.5) {
                videoRef.current.currentTime = clipTime
            }
            if (isPlaying && videoRef.current.paused) {
                videoRef.current.play().catch(() => { })
            } else if (!isPlaying && !videoRef.current.paused) {
                videoRef.current.pause()
            }
        }
    }, [activeVideoClip, playheadTime, isPlaying])

    useEffect(() => {
        if (audioRef.current && activeAudioClip) {
            const clipTime = playheadTime - activeAudioClip.startTime + activeAudioClip.trimStart
            if (Math.abs(audioRef.current.currentTime - clipTime) > 0.5) {
                audioRef.current.currentTime = clipTime
            }
            if (isPlaying && audioRef.current.paused) {
                audioRef.current.play().catch(() => { })
            } else if (!isPlaying && !audioRef.current.paused) {
                audioRef.current.pause()
            }
        }
    }, [activeAudioClip, playheadTime, isPlaying])

    // --- Track/Clip Operations ---
    const updateClipInTrack = useCallback((clipId: string, updater: (clip: TimelineClip) => TimelineClip) => {
        setTracks(prev => prev.map(track => ({
            ...track,
            clips: track.clips.map(c => c.id === clipId ? updater(c) : c)
        })))
    }, [])

    const deleteClip = useCallback((clipId: string) => {
        setTracks(prev => prev.map(track => ({
            ...track,
            clips: track.clips.filter(c => c.id !== clipId)
        })))
        if (selectedClipId === clipId) setSelectedClipId(null)
    }, [selectedClipId])

    const splitClipAtPlayhead = useCallback(() => {
        if (!selectedClipId) return

        setTracks(prev => {
            const newTracks: Track[] = []
            for (const track of prev) {
                const clipIndex = track.clips.findIndex(c => c.id === selectedClipId)
                if (clipIndex === -1) {
                    newTracks.push(track)
                    continue
                }

                const clip = track.clips[clipIndex]
                const effectiveDur = clip.duration - clip.trimStart - clip.trimEnd
                const splitAt = playheadTime - clip.startTime

                if (splitAt <= 0.1 || splitAt >= effectiveDur - 0.1) {
                    newTracks.push(track)
                    continue
                }

                const clip1: TimelineClip = {
                    ...clip,
                    id: generateClipId(),
                    duration: splitAt + clip.trimStart,
                    trimEnd: 0,
                }
                const clip2: TimelineClip = {
                    ...clip,
                    id: generateClipId(),
                    startTime: clip.startTime + splitAt,
                    trimStart: clip.trimStart + splitAt,
                    duration: clip.duration,
                    trimEnd: clip.trimEnd,
                }

                const newClips = [...track.clips]
                newClips.splice(clipIndex, 1, clip1, clip2)
                newTracks.push({ ...track, clips: newClips })
            }
            return newTracks
        })
    }, [selectedClipId, playheadTime])

    const addExternalMedia = useCallback(async () => {
        try {
            const result = await (window as any).api.importMedia()
            if (!result?.success) return

            const fileType = result.type as 'video' | 'audio' | 'image' | 'other'
            const trackId = fileType === 'audio' ? 'audio-1' : 'video-1'

            // Find end of track
            const track = tracks.find(t => t.id === trackId)
            let endTime = 0
            if (track) {
                for (const c of track.clips) {
                    const ce = c.startTime + c.duration - c.trimStart - c.trimEnd
                    if (ce > endTime) endTime = ce
                }
            }

            const newClip: TimelineClip = {
                id: generateClipId(),
                fileName: result.fileName || 'imported',
                filePath: result.filePath,
                fileType,
                trackId,
                startTime: endTime,
                duration: result.duration || (fileType === 'image' ? DEFAULT_IMG_DURATION : 10),
                trimStart: 0,
                trimEnd: 0,
            }

            setTracks(prev => prev.map(t =>
                t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
            ))
        } catch (e) {
            console.error('Failed to import media:', e)
        }
    }, [tracks])

    // --- Click timeline to set playhead ---
    const handleTimelineClick = useCallback((e: React.MouseEvent) => {
        if (!timelineRef.current) return
        const rect = timelineRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left + scrollLeft
        const time = Math.max(0, x / zoom)
        setPlayheadTime(time)
    }, [zoom, scrollLeft])

    // --- Clip drag (reposition) ---
    const handleClipDragStart = useCallback((clipId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedClipId(clipId)

        const startX = e.clientX
        let clip: TimelineClip | null = null
        let track: Track | null = null

        for (const t of tracks) {
            const found = t.clips.find(c => c.id === clipId)
            if (found) {
                clip = found
                track = t
                break
            }
        }
        if (!clip || !track) return

        const origStart = clip.startTime
        const effectiveDur = clip.duration - clip.trimStart - clip.trimEnd

        // Get all other clips in this track to check collisions
        const otherClips = track.clips.filter(c => c.id !== clipId)

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX
            const dt = dx / zoom

            // Calculate proposed new start
            let newStart = origStart + dt

            // Snap to 0.05s grid
            newStart = Math.round(newStart * 20) / 20

            // Boundary check (>= 0)
            if (newStart < 0) newStart = 0

            // Collision check: Does [newStart, newStart + effectiveDur] overlap ANY other clip?
            const newEnd = newStart + effectiveDur
            const epsilon = 0.01

            const hasCollision = otherClips.some(other => {
                const otherEffEnd = other.startTime + (other.duration - other.trimStart - other.trimEnd)
                const otherStart = other.startTime
                return (newStart < otherEffEnd - epsilon) && (newEnd > otherStart + epsilon)
            })

            if (!hasCollision) {
                if (Math.abs(newStart - clip!.startTime) > 0.001) {
                    updateClipInTrack(clipId, c => ({ ...c, startTime: newStart }))
                }
            }
        }

        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [tracks, zoom, updateClipInTrack])

    // --- Clip edge drag (trim) ---
    const handleEdgeDrag = useCallback((clipId: string, edge: 'left' | 'right', e: React.MouseEvent) => {
        e.stopPropagation()
        const startX = e.clientX
        let clip: TimelineClip | null = null
        let track: Track | null = null

        for (const t of tracks) {
            const found = t.clips.find(c => c.id === clipId)
            if (found) {
                clip = found
                track = t
                break
            }
        }
        if (!clip || !track) return

        const origTrimStart = clip.trimStart
        const origTrimEnd = clip.trimEnd
        const origStartTime = clip.startTime
        const origDuration = clip.duration // total source duration
        const effectiveDur = origDuration - origTrimStart - origTrimEnd

        // Find boundaries
        const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
        const clipIndex = sortedClips.findIndex(c => c.id === clipId)

        let prevEnd = 0
        let nextStart = Infinity

        if (clipIndex > 0) {
            const prev = sortedClips[clipIndex - 1]
            prevEnd = prev.startTime + (prev.duration - prev.trimStart - prev.trimEnd)
        }
        if (clipIndex < sortedClips.length - 1) {
            nextStart = sortedClips[clipIndex + 1].startTime
        }

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX
            const dt = dx / zoom

            if (edge === 'left') {
                // Moving start time right (trimming start)
                // New start time = origStartTime + dt
                // Constraint 1: newStart >= prevEnd
                // Constraint 2: newStart <= (origStartTime + effectiveDur - minDur of 0.1s)

                let newStart = origStartTime + dt
                newStart = Math.round(newStart * 20) / 20 // Snap

                const minStart = prevEnd
                const maxStart = origStartTime + effectiveDur - 0.1

                newStart = Math.max(minStart, Math.min(maxStart, newStart))

                // Calculate new trimStart
                // deltaT = newStart - origStartTime
                // newTrimStart = origTrimStart + deltaT
                // but we must clamp newTrimStart >= 0

                const deltaT = newStart - origStartTime
                let newTrimStart = origTrimStart + deltaT

                if (newTrimStart < 0) {
                    newTrimStart = 0
                    newStart = origStartTime - origTrimStart
                }

                if (Math.abs(newStart - clip!.startTime) > 0.001) {
                    updateClipInTrack(clipId, c => ({
                        ...c,
                        trimStart: newTrimStart,
                        startTime: newStart
                    }))
                }

            } else {
                // Moving end time (trimming end)
                // New end time = origEnd + dt
                // Constraint: newEnd <= nextStart
                // Constraint: newEnd >= start + 0.1

                const origEnd = origStartTime + effectiveDur
                let newEnd = origEnd + dt
                newEnd = Math.round(newEnd * 20) / 20 // Snap

                const minEnd = origStartTime + 0.1
                const maxEnd = nextStart

                newEnd = Math.max(minEnd, Math.min(maxEnd, newEnd))

                // newEffectiveDur = newEnd - origStartTime
                // newTrimEnd = origDuration - origTrimStart - newEffectiveDur
                // clamp newTrimEnd >= 0

                const newEffectiveDur = newEnd - origStartTime
                let newTrimEnd = origDuration - origTrimStart - newEffectiveDur

                if (newTrimEnd < 0) {
                    newTrimEnd = 0
                }

                updateClipInTrack(clipId, c => ({ ...c, trimEnd: newTrimEnd }))
            }
        }

        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [tracks, zoom, updateClipInTrack])

    // --- Scroll handler ---
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollLeft(e.currentTarget.scrollLeft)
    }, [])

    // --- Keyboard shortcuts ---
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return
            if (e.key === ' ') { e.preventDefault(); togglePlayback() }
            if (e.key === 'Delete' && selectedClipId) { deleteClip(selectedClipId) }
            if (e.key === 's' || e.key === 'S') { splitClipAtPlayhead() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [togglePlayback, selectedClipId, deleteClip, splitClipAtPlayhead])

    // --- Render ---
    return (
        <div className="timeline-editor">
            {/* Toolbar */}
            <div className="timeline-toolbar">
                <div className="toolbar-left">
                    <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
                    <span className="toolbar-divider" />
                    <button className="btn btn-accent btn-sm" onClick={togglePlayback}>
                        {isPlaying ? '⏸ Pause' : '▶ Play'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => { stopPlayback(); setPlayheadTime(0) }}>
                        ⏹ Stop
                    </button>
                    <span className="timeline-time">{formatTime(playheadTime)}</span>
                </div>

                <div className="toolbar-actions">
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={splitClipAtPlayhead}
                        disabled={!selectedClipId}
                        title="Split clip at playhead (S)"
                    >✂ Split</button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => selectedClipId && deleteClip(selectedClipId)}
                        disabled={!selectedClipId}
                        title="Delete clip (Del)"
                    >🗑 Delete</button>
                    <button className="btn btn-secondary btn-sm" onClick={addExternalMedia}>
                        📎 Add Media
                    </button>
                    <span className="toolbar-divider" />
                    <label className="zoom-control">
                        🔍
                        <input
                            type="range"
                            min={MIN_ZOOM}
                            max={MAX_ZOOM}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                        />
                    </label>
                </div>
            </div>

            {/* Preview Player */}
            <div className="timeline-preview">
                <div className="preview-viewport">
                    {activeVideoClip ? (
                        activeVideoClip.fileType === 'image' ? (
                            <img
                                src={`local-file://${activeVideoClip.filePath}`}
                                alt={activeVideoClip.fileName}
                                className="timeline-preview-media"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                src={`local-file://${activeVideoClip.filePath}`}
                                className="timeline-preview-media"
                                muted={!!activeAudioClip}
                            />
                        )
                    ) : (
                        <div className="preview-empty-state">
                            <span className="empty-icon-large">🎬</span>
                            <p>Move playhead over a clip to preview</p>
                        </div>
                    )}
                </div>
                {activeAudioClip && (
                    <audio ref={audioRef} src={`local-file://${activeAudioClip.filePath}`} />
                )}
            </div>

            {/* Timeline Tracks */}
            <div className="timeline-tracks-container" onScroll={handleScroll}>
                {/* Time ruler */}
                <div className="timeline-ruler" style={{ width: timelineWidth }}>
                    {Array.from({ length: Math.ceil(totalDuration) + 1 }, (_, i) => (
                        <div
                            key={i}
                            className="ruler-mark"
                            style={{ left: i * zoom }}
                        >
                            <span className="ruler-label">{formatTime(i)}</span>
                        </div>
                    ))}
                </div>

                {/* Tracks */}
                <div className="timeline-tracks" ref={timelineRef} onClick={handleTimelineClick}>
                    {tracks.map(track => (
                        <div key={track.id} className={`timeline-track track-${track.type}`}>
                            <div className="track-label">
                                <span className="track-icon">
                                    {track.type === 'video' ? '🎬' : '🎵'}
                                </span>
                                <span>{track.label}</span>
                            </div>
                            <div className="track-content" style={{ width: timelineWidth }}>
                                {track.clips.map(clip => {
                                    const effectiveDur = clip.duration - clip.trimStart - clip.trimEnd
                                    const clipWidth = effectiveDur * zoom
                                    const clipLeft = clip.startTime * zoom

                                    return (
                                        <div
                                            key={clip.id}
                                            className={`timeline-clip clip-${clip.fileType} ${selectedClipId === clip.id ? 'selected' : ''} ${activeVideoClip?.id === clip.id || activeAudioClip?.id === clip.id ? 'active' : ''}`}
                                            style={{
                                                left: clipLeft,
                                                width: Math.max(20, clipWidth),
                                            }}
                                            onClick={(e) => { e.stopPropagation(); setSelectedClipId(clip.id) }}
                                            onMouseDown={(e) => handleClipDragStart(clip.id, e)}
                                            title={`${getFileName(clip.fileName)} (${formatTime(effectiveDur)})`}
                                        >
                                            {/* Left trim handle */}
                                            <div
                                                className="clip-edge clip-edge-left"
                                                onMouseDown={(e) => handleEdgeDrag(clip.id, 'left', e)}
                                            />

                                            <div className="clip-body">
                                                <span className="clip-icon">
                                                    {clip.fileType === 'video' ? '🎬' : clip.fileType === 'audio' ? '🎵' : '🖼️'}
                                                </span>
                                                <span className="clip-name">{getFileName(clip.fileName)}</span>
                                            </div>

                                            {/* Right trim handle */}
                                            <div
                                                className="clip-edge clip-edge-right"
                                                onMouseDown={(e) => handleEdgeDrag(clip.id, 'right', e)}
                                            />
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    ))}

                    {/* Playhead */}
                    <div
                        className="timeline-playhead"
                        style={{ left: playheadTime * zoom }}
                    >
                        <div className="playhead-head" />
                        <div className="playhead-line" />
                    </div>
                </div>
            </div>

            {/* Status Bar */}
            <div className="timeline-status">
                <span>Zoom: {zoom}px/s</span>
                <span>Duration: {formatTime(totalDuration)}</span>
                <span>Clips: {tracks.reduce((sum, t) => sum + t.clips.length, 0)}</span>
                {selectedClipId && <span>Selected: {
                    getFileName(tracks.flatMap(t => t.clips).find(c => c.id === selectedClipId)?.fileName || '')
                }</span>}
                <span className="timeline-shortcuts-hint">
                    Space: Play/Pause · S: Split · Del: Delete
                </span>
            </div>
        </div>
    )
}
