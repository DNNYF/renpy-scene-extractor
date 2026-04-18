import { FC, useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { buildLocalFileUrl, measureMediaSourceDuration, TIMELINE_TRACK_LABEL_WIDTH } from './mediaUtils'

/* ===================================================
   Types & Interfaces
   =================================================== */

interface RpaFile {
    name: string
    size: number
    type: 'video' | 'image' | 'audio' | 'other'
    parts: number
}

export interface TimelineSourceClip {
    file: RpaFile
    path: string
    sourceDuration?: number
}

export interface TimelineClip {
    id: string
    fileName: string
    filePath: string   // local file path for playback
    fileType: 'video' | 'image' | 'audio' | 'other'
    trackId: string
    startTime: number  // seconds offset on timeline
    duration: number   // source duration for audio/video, display duration for images
    sourceDuration?: number
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
    initialClips: TimelineSourceClip[]
    onBack: () => void
    onExport?: () => void
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

function isTimelineMediaType(value: string | undefined): value is TimelineClip['fileType'] {
    return value === 'video' || value === 'audio' || value === 'image' || value === 'other'
}

const DEFAULT_IMG_DURATION = 5 // seconds
const MIN_CLIP_DURATION = 0.1
const MIN_ZOOM = 10  // px per second
const MAX_ZOOM = 200

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function getSourceDuration(clip: TimelineClip): number | undefined {
    return clip.fileType === 'image' ? undefined : clip.sourceDuration ?? clip.duration
}

function getEffectiveDuration(clip: TimelineClip): number {
    if (clip.fileType === 'image') {
        return clip.duration
    }

    const sourceDuration = getSourceDuration(clip) ?? clip.duration
    return Math.max(MIN_CLIP_DURATION, sourceDuration - clip.trimStart - clip.trimEnd)
}

function getClipEnd(clip: TimelineClip): number {
    return clip.startTime + getEffectiveDuration(clip)
}

function createTimelineClip(item: TimelineSourceClip, startTime: number): TimelineClip {
    const sourceDuration = item.file.type === 'image' ? undefined : item.sourceDuration
    const baseDuration = item.file.type === 'image'
        ? DEFAULT_IMG_DURATION
        : sourceDuration ?? MIN_CLIP_DURATION

    return {
        id: generateClipId(),
        fileName: item.file.name,
        filePath: item.path,
        fileType: item.file.type,
        trackId: item.file.type === 'audio' ? 'audio-1' : 'video-1',
        startTime,
        duration: baseDuration,
        sourceDuration,
        trimStart: 0,
        trimEnd: 0,
    }
}

function compactTrackClips(track: Track): Track {
    const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
    let cursor = 0

    return {
        ...track,
        clips: sortedClips.map((clip) => {
            const nextClip = {
                ...clip,
                startTime: cursor,
            }
            cursor += getEffectiveDuration(nextClip)
            return nextClip
        }),
    }
}

function duplicateClipOnTrack(track: Track, clipId: string): { track: Track; duplicatedId: string | null } {
    const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
    const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId)

    if (clipIndex === -1) {
        return { track, duplicatedId: null }
    }

    const sourceClip = sortedClips[clipIndex]
    const duplicatedClip: TimelineClip = {
        ...sourceClip,
        id: generateClipId(),
        startTime: getClipEnd(sourceClip),
    }

    const nextClips: TimelineClip[] = []
    let cursor = 0

    sortedClips.forEach((clip, index) => {
        const currentClip = index <= clipIndex
            ? { ...clip, startTime: clip.startTime }
            : { ...clip, startTime: Math.max(clip.startTime, cursor) }

        nextClips.push(currentClip)
        cursor = getClipEnd(currentClip)

        if (index === clipIndex) {
            duplicatedClip.startTime = cursor
            nextClips.push(duplicatedClip)
            cursor = getClipEnd(duplicatedClip)
        }
    })

    return {
        track: {
            ...track,
            clips: nextClips,
        },
        duplicatedId: duplicatedClip.id,
    }
}

/* ===================================================
   TimelineEditor — Main Container
   =================================================== */

export const TimelineEditor: FC<TimelineEditorProps> = ({ initialClips, onBack, onExport }) => {
    // --- State ---
    const [tracks, setTracks] = useState<Track[]>(() => {
        // Create initial tracks from queue items
        const videoClips: TimelineClip[] = []
        const audioClips: TimelineClip[] = []
        let videoOffset = 0
        let audioOffset = 0

        for (const item of initialClips) {
            const clip = createTimelineClip(item, item.file.type === 'audio' ? audioOffset : videoOffset)
            if (item.file.type === 'audio') {
                clip.trackId = 'audio-1'
                audioClips.push(clip)
                audioOffset += getEffectiveDuration(clip)
            } else {
                clip.trackId = 'video-1'
                videoClips.push(clip)
                videoOffset += getEffectiveDuration(clip)
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
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
    const [durationDraft, setDurationDraft] = useState('')
    const [trimStartDraft, setTrimStartDraft] = useState('')
    const [startTimeDraft, setStartTimeDraft] = useState('')

    // Refs
    const timelineScrollerRef = useRef<HTMLDivElement>(null)
    const animFrameRef = useRef<number>(0)
    const lastTimeRef = useRef<number>(0)
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRef = useRef<HTMLAudioElement>(null)

    const updateClipInTrack = useCallback((clipId: string, updater: (clip: TimelineClip) => TimelineClip) => {
        setTracks(prev => prev.map(track => ({
            ...track,
            clips: track.clips.map(clip => clip.id === clipId ? updater(clip) : clip),
        })))
    }, [])

    // --- Derived ---
    const totalDuration = useMemo(() => {
        let max = 30 // minimum 30 seconds
        for (const track of tracks) {
            for (const clip of track.clips) {
                const end = getClipEnd(clip)
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
                const effectiveEnd = getClipEnd(clip)
                if (playheadTime >= clip.startTime && playheadTime < effectiveEnd) {
                    return clip
                }
            }
        }
        return null
    }, [tracks, playheadTime])

    const activeVideoClip = getActiveClip('video')
    const activeAudioClip = getActiveClip('audio')
    const selectedClip = useMemo(
        () => tracks.flatMap(track => track.clips).find(clip => clip.id === selectedClipId) ?? null,
        [tracks, selectedClipId]
    )

    useEffect(() => {
        if (!selectedClip) {
            setDurationDraft('')
            setTrimStartDraft('')
            setStartTimeDraft('')
            return
        }

        setDurationDraft(getEffectiveDuration(selectedClip).toFixed(2))
        setStartTimeDraft(selectedClip.startTime.toFixed(2))
        setTrimStartDraft(selectedClip.fileType === 'image' ? '' : selectedClip.trimStart.toFixed(2))
    }, [selectedClip])

    useEffect(() => {
        let cancelled = false

        const unresolvedClips = tracks.flatMap(track =>
            track.clips.filter(clip => clip.fileType !== 'image' && clip.sourceDuration === undefined)
        )

        if (unresolvedClips.length === 0) {
            return
        }

        unresolvedClips.forEach((clip) => {
            measureMediaSourceDuration(clip.filePath, clip.fileType).then((duration) => {
                if (cancelled || duration === undefined) return

                updateClipInTrack(clip.id, (currentClip) => {
                    const sourceDuration = duration
                    const trimStart = clamp(currentClip.trimStart, 0, Math.max(0, sourceDuration - MIN_CLIP_DURATION))
                    const maxTrimEnd = Math.max(0, sourceDuration - trimStart - MIN_CLIP_DURATION)
                    const trimEnd = clamp(currentClip.trimEnd, 0, maxTrimEnd)

                    return {
                        ...currentClip,
                        duration: sourceDuration,
                        sourceDuration,
                        trimStart,
                        trimEnd,
                    }
                })
            })
        })

        return () => {
            cancelled = true
        }
    }, [tracks, updateClipInTrack])

    const getTrackForClip = useCallback((clipId: string): { track: Track; clip: TimelineClip } | null => {
        for (const track of tracks) {
            const clip = track.clips.find((entry) => entry.id === clipId)
            if (clip) {
                return { track, clip }
            }
        }

        return null
    }, [tracks])

    const getClipNeighborBounds = useCallback((track: Track, clipId: string) => {
        const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
        const clipIndex = sortedClips.findIndex(c => c.id === clipId)

        let prevEnd = 0
        let nextStart = Infinity

        if (clipIndex > 0) {
            prevEnd = getClipEnd(sortedClips[clipIndex - 1])
        }

        if (clipIndex !== -1 && clipIndex < sortedClips.length - 1) {
            nextStart = sortedClips[clipIndex + 1].startTime
        }

        return { prevEnd, nextStart }
    }, [])

    const updateClipStartTime = useCallback((clipId: string, requestedStart: number) => {
        const located = getTrackForClip(clipId)
        if (!located) return

        const { track, clip } = located
        const { prevEnd, nextStart } = getClipNeighborBounds(track, clipId)
        const effectiveDur = getEffectiveDuration(clip)
        const maxStart = Number.isFinite(nextStart)
            ? Math.max(prevEnd, nextStart - effectiveDur)
            : Infinity

        let newStart = Math.round(requestedStart * 20) / 20
        newStart = Math.max(0, newStart)
        if (Number.isFinite(maxStart)) {
            newStart = clamp(newStart, prevEnd, maxStart)
        } else {
            newStart = Math.max(prevEnd, newStart)
        }

        updateClipInTrack(clipId, currentClip => ({ ...currentClip, startTime: newStart }))
    }, [getClipNeighborBounds, getTrackForClip, updateClipInTrack])

    const updateClipTrimStart = useCallback((clipId: string, requestedTrimStart: number) => {
        const located = getTrackForClip(clipId)
        if (!located) return

        const { track, clip } = located
        if (clip.fileType === 'image') return

        const { prevEnd } = getClipNeighborBounds(track, clipId)
        const sourceDuration = getSourceDuration(clip) ?? clip.duration
        const maxTrimStart = Math.max(0, sourceDuration - clip.trimEnd - MIN_CLIP_DURATION)
        const nextTrimStart = clamp(requestedTrimStart, 0, maxTrimStart)
        const currentEnd = getClipEnd(clip)
        const nextEffectiveDuration = Math.max(MIN_CLIP_DURATION, sourceDuration - nextTrimStart - clip.trimEnd)
        const nextStart = Math.max(prevEnd, currentEnd - nextEffectiveDuration)
        const appliedTrimStart = clamp(sourceDuration - clip.trimEnd - (currentEnd - nextStart), 0, maxTrimStart)

        updateClipInTrack(clipId, currentClip => ({
            ...currentClip,
            trimStart: appliedTrimStart,
            startTime: nextStart,
        }))
    }, [getClipNeighborBounds, getTrackForClip, updateClipInTrack])

    const updateClipLength = useCallback((clipId: string, requestedLength: number) => {
        const located = getTrackForClip(clipId)
        if (!located) return

        const { track, clip } = located
        const { nextStart } = getClipNeighborBounds(track, clipId)
        const maxTrackLength = Number.isFinite(nextStart)
            ? Math.max(MIN_CLIP_DURATION, nextStart - clip.startTime)
            : Infinity

        if (clip.fileType === 'image') {
            const nextDuration = Number.isFinite(maxTrackLength)
                ? clamp(requestedLength, MIN_CLIP_DURATION, maxTrackLength)
                : Math.max(MIN_CLIP_DURATION, requestedLength)

            updateClipInTrack(clipId, currentClip => ({ ...currentClip, duration: nextDuration }))
            return
        }

        const sourceDuration = getSourceDuration(clip) ?? clip.duration
        const maxSourceLength = Math.max(MIN_CLIP_DURATION, sourceDuration - clip.trimStart)
        const maxLength = Number.isFinite(maxTrackLength)
            ? Math.min(maxSourceLength, maxTrackLength)
            : maxSourceLength
        const nextEffectiveDuration = clamp(requestedLength, MIN_CLIP_DURATION, maxLength)
        const trimEnd = Math.max(0, sourceDuration - clip.trimStart - nextEffectiveDuration)

        updateClipInTrack(clipId, currentClip => ({ ...currentClip, trimEnd }))
    }, [getClipNeighborBounds, getTrackForClip, updateClipInTrack])

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

    const seekToTime = useCallback((time: number) => {
        setPlayheadTime(clamp(time, 0, totalDuration))
    }, [totalDuration])

    const getTimelineTimeFromClientX = useCallback((clientX: number) => {
        const timelineScroller = timelineScrollerRef.current
        if (!timelineScroller) return 0

        const rect = timelineScroller.getBoundingClientRect()
        const offsetX = clientX - rect.left + timelineScroller.scrollLeft - TIMELINE_TRACK_LABEL_WIDTH
        return clamp(offsetX / zoom, 0, totalDuration)
    }, [totalDuration, zoom])

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
    const deleteClip = useCallback((clipId: string) => {
        setTracks(prev => prev.map(track => {
            const remainingClips = track.clips.filter(c => c.id !== clipId)
            if (remainingClips.length === track.clips.length) {
                return track
            }

            return compactTrackClips({
                ...track,
                clips: remainingClips,
            })
        }))
        if (selectedClipId === clipId) setSelectedClipId(null)
    }, [selectedClipId])

    const closeTrackGaps = useCallback(() => {
        setTracks(prev => prev.map(track => compactTrackClips(track)))
    }, [])

    const duplicateSelectedClip = useCallback(() => {
        if (!selectedClipId) return

        let duplicatedId: string | null = null
        setTracks(prev => prev.map(track => {
            if (!track.clips.some((clip) => clip.id === selectedClipId)) {
                return track
            }

            const result = duplicateClipOnTrack(track, selectedClipId)
            duplicatedId = result.duplicatedId
            return result.track
        }))

        if (duplicatedId) {
            setSelectedClipId(duplicatedId)
        }
    }, [selectedClipId])

    const splitClipAtPlayhead = useCallback(() => {
        if (!selectedClipId) return

        let nextSelectedClipId: string | null = selectedClipId

        setTracks(prev => {
            const newTracks: Track[] = []
            for (const track of prev) {
                const clipIndex = track.clips.findIndex(c => c.id === selectedClipId)
                if (clipIndex === -1) {
                    newTracks.push(track)
                    continue
                }

                const clip = track.clips[clipIndex]
                const effectiveDur = getEffectiveDuration(clip)
                const splitAt = playheadTime - clip.startTime
                const sourceDuration = getSourceDuration(clip)

                if (splitAt <= MIN_CLIP_DURATION || splitAt >= effectiveDur - MIN_CLIP_DURATION) {
                    newTracks.push(track)
                    continue
                }

                const clip1: TimelineClip = {
                    ...clip,
                    id: generateClipId(),
                }
                const clip2: TimelineClip = {
                    ...clip,
                    id: generateClipId(),
                    startTime: clip.startTime + splitAt,
                    trimStart: clip.trimStart + splitAt,
                    trimEnd: clip.trimEnd,
                }

                if (clip.fileType === 'image') {
                    clip1.duration = splitAt
                    clip2.duration = Math.max(MIN_CLIP_DURATION, effectiveDur - splitAt)
                    clip2.trimStart = 0
                    clip2.trimEnd = 0
                } else if (sourceDuration !== undefined) {
                    clip1.duration = sourceDuration
                    clip1.sourceDuration = sourceDuration
                    clip1.trimEnd = Math.max(0, sourceDuration - clip.trimStart - splitAt)
                    clip2.duration = sourceDuration
                    clip2.sourceDuration = sourceDuration
                } else {
                    clip1.duration = MIN_CLIP_DURATION
                    clip1.trimEnd = 0
                    clip2.duration = MIN_CLIP_DURATION
                }

                nextSelectedClipId = clip2.id

                const newClips = [...track.clips]
                newClips.splice(clipIndex, 1, clip1, clip2)
                newTracks.push({ ...track, clips: newClips })
            }
            return newTracks
        })

        setSelectedClipId(nextSelectedClipId)
    }, [selectedClipId, playheadTime])

    const addExternalMedia = useCallback(async () => {
        try {
            const result = await window.api.importMedia()
            if (!result?.success || !result.filePath || !isTimelineMediaType(result.type)) return

            const fileType = result.type
            const trackId = fileType === 'audio' ? 'audio-1' : 'video-1'
            const sourceDuration = await measureMediaSourceDuration(result.filePath, fileType)

            // Find end of track
            const track = tracks.find(t => t.id === trackId)
            let endTime = 0
            if (track) {
                for (const c of track.clips) {
                    const ce = getClipEnd(c)
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
                duration: fileType === 'image' ? DEFAULT_IMG_DURATION : sourceDuration ?? MIN_CLIP_DURATION,
                sourceDuration,
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
        if (e.target instanceof HTMLElement && e.target.closest('.track-label')) return

        seekToTime(getTimelineTimeFromClientX(e.clientX))
    }, [getTimelineTimeFromClientX, seekToTime])

    const handleRulerPointerDown = useCallback((e: React.MouseEvent) => {
        if (e.target instanceof HTMLElement && e.target.closest('.timeline-ruler-gutter')) return

        e.preventDefault()
        seekToTime(getTimelineTimeFromClientX(e.clientX))
    }, [getTimelineTimeFromClientX, seekToTime])

    const handlePlayheadDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()

        stopPlayback()
        seekToTime(getTimelineTimeFromClientX(e.clientX))

        const onMove = (ev: MouseEvent) => {
            seekToTime(getTimelineTimeFromClientX(ev.clientX))
        }

        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'ew-resize'
        document.body.style.userSelect = 'none'
    }, [getTimelineTimeFromClientX, seekToTime, stopPlayback])

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
        const effectiveDur = getEffectiveDuration(clip)

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
                const otherEffEnd = getClipEnd(other)
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
        const sourceDuration = clip.fileType === 'image'
            ? clip.duration
            : getSourceDuration(clip) ?? clip.duration
        const effectiveDur = getEffectiveDuration(clip)

        // Find boundaries
        const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
        const clipIndex = sortedClips.findIndex(c => c.id === clipId)

        let prevEnd = 0
        let nextStart = Infinity

        if (clipIndex > 0) {
            const prev = sortedClips[clipIndex - 1]
            prevEnd = getClipEnd(prev)
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
                const maxStart = origStartTime + effectiveDur - MIN_CLIP_DURATION

                newStart = Math.max(minStart, Math.min(maxStart, newStart))

                // Calculate new trimStart
                // deltaT = newStart - origStartTime
                // newTrimStart = origTrimStart + deltaT
                // but we must clamp newTrimStart >= 0

                const deltaT = newStart - origStartTime
                let newTrimStart = origTrimStart + deltaT

                if (newTrimStart < 0) {
                    newTrimStart = 0
                    newStart = Math.max(prevEnd, origStartTime - origTrimStart)
                }

                if (clip!.fileType !== 'image') {
                    const maxTrimStart = Math.max(0, sourceDuration - origTrimEnd - MIN_CLIP_DURATION)
                    newTrimStart = clamp(newTrimStart, 0, maxTrimStart)
                    newStart = Math.max(prevEnd, origStartTime + (newTrimStart - origTrimStart))
                } else {
                    newStart = Math.max(prevEnd, newStart)
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

                const minEnd = origStartTime + MIN_CLIP_DURATION
                const maxEnd = nextStart

                newEnd = Math.max(minEnd, Math.min(maxEnd, newEnd))

                // newEffectiveDur = newEnd - origStartTime
                // newTrimEnd = origDuration - origTrimStart - newEffectiveDur
                // clamp newTrimEnd >= 0

                const newEffectiveDur = newEnd - origStartTime
                let newTrimEnd = sourceDuration - origTrimStart - newEffectiveDur

                if (newTrimEnd < 0) {
                    newTrimEnd = 0
                }

                if (clip!.fileType === 'image') {
                    updateClipInTrack(clipId, c => ({ ...c, duration: newEffectiveDur }))
                } else {
                    updateClipInTrack(clipId, c => ({ ...c, trimEnd: newTrimEnd }))
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

    // --- Keyboard shortcuts ---
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement) return
            if (e.key === ' ') { e.preventDefault(); togglePlayback() }
            if (e.key === 'Delete' && selectedClipId) { deleteClip(selectedClipId) }
            if (e.key === 's' || e.key === 'S') { splitClipAtPlayhead() }
            if ((e.key === 'd' || e.key === 'D') && selectedClipId) { e.preventDefault(); duplicateSelectedClip() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [togglePlayback, selectedClipId, deleteClip, splitClipAtPlayhead, duplicateSelectedClip])

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
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={duplicateSelectedClip}
                        disabled={!selectedClipId}
                        title="Duplicate selected clip (D)"
                    >⧉ Duplicate</button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={closeTrackGaps}
                        disabled={tracks.every((track) => track.clips.length < 2)}
                        title="Shift clips left to fill empty gaps"
                    >⇤ Close Gaps</button>
                    <button className="btn btn-secondary btn-sm" onClick={addExternalMedia}>
                        📎 Add Media
                    </button>
                    {onExport ? (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={onExport}
                            title="Export timeline"
                        >⬇ Export</button>
                    ) : (
                        <div className="timeline-export-placeholder">
                            <button
                                className="btn btn-secondary btn-sm"
                                type="button"
                                disabled
                                aria-disabled="true"
                            >⬇ Export Soon</button>
                            <span className="timeline-toolbar-note">No export backend connected yet.</span>
                        </div>
                    )}
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

            <div className="timeline-inspector">
                <div className="inspector-header">
                    <div>
                        <p className="inspector-eyebrow">Selected clip</p>
                        <h2>{selectedClip ? getFileName(selectedClip.fileName) : 'No clip selected'}</h2>
                    </div>
                    {selectedClip && (
                        <div className="inspector-badges">
                            <span className={`inspector-badge badge-${selectedClip.fileType}`}>{selectedClip.fileType}</span>
                            <span className="inspector-badge">Length {formatTime(getEffectiveDuration(selectedClip))}</span>
                            {selectedClip.fileType !== 'image' && getSourceDuration(selectedClip) !== undefined && (
                                <span className="inspector-badge">Source {formatTime(getSourceDuration(selectedClip) || 0)}</span>
                            )}
                        </div>
                    )}
                </div>

                {selectedClip ? (
                    <div className="inspector-grid">
                        <label className="timeline-field">
                            <span className="timeline-field-label">Timeline start</span>
                            <input
                                className="timeline-field-input"
                                type="number"
                                min={0}
                                step="0.05"
                                value={startTimeDraft}
                                onChange={(e) => setStartTimeDraft(e.target.value)}
                                onBlur={() => {
                                    const parsed = Number(startTimeDraft)
                                    if (!Number.isFinite(parsed)) {
                                        setStartTimeDraft(selectedClip.startTime.toFixed(2))
                                        return
                                    }
                                    updateClipStartTime(selectedClip.id, parsed)
                                }}
                            />
                        </label>

                        {selectedClip.fileType !== 'image' && (
                            <label className="timeline-field">
                                <span className="timeline-field-label">In offset</span>
                                <input
                                    className="timeline-field-input"
                                    type="number"
                                    min={0}
                                    step="0.05"
                                    value={trimStartDraft}
                                    onChange={(e) => setTrimStartDraft(e.target.value)}
                                    onBlur={() => {
                                        const parsed = Number(trimStartDraft)
                                        if (!Number.isFinite(parsed)) {
                                            setTrimStartDraft(selectedClip.trimStart.toFixed(2))
                                            return
                                        }
                                        updateClipTrimStart(selectedClip.id, parsed)
                                    }}
                                />
                            </label>
                        )}

                        <label className="timeline-field">
                            <span className="timeline-field-label">Clip length</span>
                            <input
                                className="timeline-field-input"
                                type="number"
                                min={MIN_CLIP_DURATION}
                                step="0.05"
                                value={durationDraft}
                                onChange={(e) => setDurationDraft(e.target.value)}
                                onBlur={() => {
                                    const parsed = Number(durationDraft)
                                    if (!Number.isFinite(parsed)) {
                                        setDurationDraft(getEffectiveDuration(selectedClip).toFixed(2))
                                        return
                                    }
                                    updateClipLength(selectedClip.id, parsed)
                                }}
                            />
                        </label>

                        <div className="timeline-field timeline-field-readonly">
                            <span className="timeline-field-label">Source limit</span>
                            <div className="timeline-field-value">
                                {selectedClip.fileType === 'image'
                                    ? 'Image clip'
                                    : getSourceDuration(selectedClip) !== undefined
                                        ? formatTime(getSourceDuration(selectedClip) || 0)
                                        : 'Measuring…'}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="inspector-empty">Pick a clip to edit its start, trim, and duration with exact values.</p>
                )}
            </div>

            {/* Preview Player */}
            <div className="timeline-preview">
                <div className="preview-viewport">
                    {activeVideoClip ? (
                        activeVideoClip.fileType === 'image' ? (
                            <img
                                src={buildLocalFileUrl(activeVideoClip.filePath)}
                                alt={activeVideoClip.fileName}
                                className="timeline-preview-media"
                            />
                        ) : (
                            <video
                                ref={videoRef}
                                src={buildLocalFileUrl(activeVideoClip.filePath)}
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
                    <audio ref={audioRef} src={buildLocalFileUrl(activeAudioClip.filePath)} />
                )}
            </div>

            {/* Timeline Tracks */}
            <div className="timeline-tracks-container" ref={timelineScrollerRef}>
                {/* Time ruler */}
                <div
                    className="timeline-ruler"
                    style={{ width: timelineWidth + TIMELINE_TRACK_LABEL_WIDTH }}
                    onMouseDown={handleRulerPointerDown}
                >
                    <div className="timeline-ruler-gutter" />
                    <div className="timeline-ruler-content" style={{ width: timelineWidth }}>
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
                </div>

                {/* Tracks */}
                <div className="timeline-tracks" onClick={handleTimelineClick}>
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
                                    const effectiveDur = getEffectiveDuration(clip)
                                    const clipWidth = effectiveDur * zoom
                                    const clipLeft = clip.startTime * zoom
                                    const sourceDuration = getSourceDuration(clip)

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
                                            title={`${getFileName(clip.fileName)} · clip ${formatTime(effectiveDur)}${sourceDuration !== undefined ? ` / source ${formatTime(sourceDuration)}` : ''}`}
                                        >
                                            {/* Left trim handle */}
                                            <div
                                                className="clip-edge clip-edge-left"
                                                title="Trim clip start"
                                                onMouseDown={(e) => handleEdgeDrag(clip.id, 'left', e)}
                                            />

                                            <div className="clip-body">
                                                <div className="clip-main-row">
                                                    <span className="clip-icon">
                                                        {clip.fileType === 'video' ? '🎬' : clip.fileType === 'audio' ? '🎵' : '🖼️'}
                                                    </span>
                                                    <span className="clip-name">{getFileName(clip.fileName)}</span>
                                                </div>
                                                <span className="clip-meta">
                                                    {formatTime(effectiveDur)}
                                                    {sourceDuration !== undefined && ` / ${formatTime(sourceDuration)}`}
                                                </span>
                                            </div>

                                            {/* Right trim handle */}
                                            <div
                                                className="clip-edge clip-edge-right"
                                                title="Trim clip end"
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
                        style={{ left: TIMELINE_TRACK_LABEL_WIDTH + (playheadTime * zoom) }}
                        onMouseDown={handlePlayheadDragStart}
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
                {selectedClip && <span>Selected: {getFileName(selectedClip.fileName)}</span>}
                {selectedClip && <span>Length: {formatTime(getEffectiveDuration(selectedClip))}</span>}
                <span className="timeline-shortcuts-hint">
                    Space: Play/Pause · S: Split · D: Duplicate · Del: Delete
                </span>
            </div>
        </div>
    )
}
