import { FC, useState, useRef, useCallback, useEffect, useMemo, type SetStateAction } from 'react'
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
    displayDuration?: number
    sourceQueueKey?: string
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
    sourceQueueKey?: string
    trimStart: number  // trim from beginning (seconds)
    trimEnd: number    // trim from end (seconds)
}

export interface TimelineExportProject {
    tracks: Track[]
    totalDuration: number
}

export interface Track {
    id: string
    type: 'video' | 'audio'
    label: string
    clips: TimelineClip[]
}

interface TimelineEditorProps {
    initialClips: TimelineSourceClip[]
    initialTracks?: Track[] | null
    onBack: () => void
    onTracksChange?: (tracks: Track[]) => void
    onExport?: (project: TimelineExportProject) => Promise<{
        success: boolean
        canceled?: boolean
        outputPath?: string
        error?: string
    }>
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

function getAudioTrackNumber(trackId: string): number {
    const match = trackId.match(/^audio-(\d+)$/)
    return match ? Number(match[1]) : 1
}

function createAudioTrack(trackNumber: number): Track {
    return {
        id: `audio-${trackNumber}`,
        type: 'audio',
        label: `Audio ${trackNumber}`,
        clips: [],
    }
}

function sortTracks(tracks: Track[]): Track[] {
    const videoTracks = tracks.filter((track) => track.type === 'video')
    const audioTracks = tracks
        .filter((track) => track.type === 'audio')
        .sort((a, b) => getAudioTrackNumber(a.id) - getAudioTrackNumber(b.id))

    return [...videoTracks, ...audioTracks]
}

function ensureAudioTrackExists(tracks: Track[], trackId: string): Track[] {
    if (!trackId.startsWith('audio-') || tracks.some((track) => track.id === trackId)) {
        return tracks
    }

    const trackNumber = getAudioTrackNumber(trackId)
    const nextTracks = [...tracks]

    for (let index = 1; index <= trackNumber; index += 1) {
        const audioTrackId = `audio-${index}`
        if (!nextTracks.some((track) => track.id === audioTrackId)) {
            nextTracks.push(createAudioTrack(index))
        }
    }

    return sortTracks(nextTracks)
}

function hasTrackCollision(track: Track, clipId: string, newStart: number, effectiveDur: number): boolean {
    const newEnd = newStart + effectiveDur
    const epsilon = 0.01

    return track.clips
        .filter((clip) => clip.id !== clipId)
        .some((other) => {
            const otherEnd = getClipEnd(other)
            return (newStart < otherEnd - epsilon) && (newEnd > other.startTime + epsilon)
        })
}

function moveClipToTrackAtTime(tracks: Track[], clipId: string, targetTrackId: string, startTime: number): Track[] {
    let movingClip: TimelineClip | null = null

    const tracksWithTarget = ensureAudioTrackExists(tracks, targetTrackId)
    const nextTracks = tracksWithTarget.map((track) => {
        const remainingClips = track.clips.filter((clip) => {
            if (clip.id === clipId) {
                movingClip = clip
                return false
            }
            return true
        })

        if (remainingClips.length === track.clips.length) {
            return track
        }

        return {
            ...track,
            clips: track.type === 'video' ? compactTrackClips({ ...track, clips: remainingClips }).clips : remainingClips,
        }
    })

    if (!movingClip) {
        return tracks
    }

    const resolvedMovingClip: TimelineClip = movingClip

    const withInserted = nextTracks.map((track) => {
        if (track.id !== targetTrackId) {
            return track
        }

        const insertedClip: TimelineClip = {
            ...resolvedMovingClip,
            trackId: targetTrackId,
            startTime,
        }

        return {
            ...track,
            clips: [...track.clips, insertedClip].sort((a, b) => a.startTime - b.startTime),
        }
    })

    return sortTracks(withInserted)
}

export function createTimelineClip(item: TimelineSourceClip, startTime: number): TimelineClip {
    const sourceDuration = item.file.type === 'image' ? undefined : item.sourceDuration
    const baseDuration = item.file.type === 'image'
        ? item.displayDuration ?? DEFAULT_IMG_DURATION
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
        sourceQueueKey: item.sourceQueueKey,
        trimStart: 0,
        trimEnd: 0,
    }
}

export function createTracksFromSourceClips(initialClips: TimelineSourceClip[]): Track[] {
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
        { id: 'video-1', type: 'video', label: 'Video', clips: videoClips },
        { id: 'audio-1', type: 'audio', label: 'Audio 1', clips: audioClips },
    ]
}

export function appendSourceClipsToTracks(currentTracks: Track[], sourceClips: TimelineSourceClip[]): Track[] {
    if (sourceClips.length === 0) {
        return currentTracks
    }

    const nextTracks = currentTracks.map((track) => ({
        ...track,
        clips: [...track.clips],
    }))

    const trackById = new Map(nextTracks.map((track) => [track.id, track]))
    const trackEndById = new Map(nextTracks.map((track) => [
        track.id,
        track.clips.reduce((max, clip) => Math.max(max, getClipEnd(clip)), 0),
    ]))

    for (const item of sourceClips) {
        const targetTrackId = item.file.type === 'audio' ? 'audio-1' : 'video-1'
        const targetTrack = trackById.get(targetTrackId)
        if (!targetTrack) continue

        const startTime = trackEndById.get(targetTrackId) ?? 0
        const clip = createTimelineClip(item, startTime)
        clip.trackId = targetTrackId
        targetTrack.clips.push(clip)
        trackEndById.set(targetTrackId, startTime + getEffectiveDuration(clip))
    }

    return nextTracks
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

function reorderClipOnTrack(track: Track, clipId: string, direction: -1 | 1): Track {
    const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
    const clipIndex = sortedClips.findIndex((clip) => clip.id === clipId)
    const targetIndex = clipIndex + direction

    if (clipIndex === -1 || targetIndex < 0 || targetIndex >= sortedClips.length) {
        return track
    }

    const reorderedClips = [...sortedClips]
    const [movedClip] = reorderedClips.splice(clipIndex, 1)
    reorderedClips.splice(targetIndex, 0, movedClip)

    const gaps = sortedClips.slice(1).map((clip, index) => Math.max(0, clip.startTime - getClipEnd(sortedClips[index])))
    const firstStart = sortedClips[0]?.startTime ?? 0
    let cursor = firstStart

    return {
        ...track,
        clips: reorderedClips.map((clip, index) => {
            const nextClip = {
                ...clip,
                startTime: index === 0 ? firstStart : cursor + gaps[index - 1],
            }
            cursor = getClipEnd(nextClip)
            return nextClip
        }),
    }
}

/* ===================================================
   TimelineEditor — Main Container
   =================================================== */

export const TimelineEditor: FC<TimelineEditorProps> = ({ initialClips, initialTracks = null, onBack, onTracksChange, onExport }) => {
    // --- State ---
    const [tracks, setTracks] = useState<Track[]>(() => initialTracks ?? createTracksFromSourceClips(initialClips))

    const [playheadTime, setPlayheadTime] = useState(0)
    const [isPlaying, setIsPlaying] = useState(false)
    const [zoom, setZoom] = useState(50) // px per second
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
    const [selectedClipIds, setSelectedClipIds] = useState<string[]>([])
    const [selectionAnchorClipId, setSelectionAnchorClipId] = useState<string | null>(null)
    const [isExporting, setIsExporting] = useState(false)
    const [exportMessage, setExportMessage] = useState<string | null>(null)
    const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false)
    const [durationDraft, setDurationDraft] = useState('')
    const [trimStartDraft, setTrimStartDraft] = useState('')
    const [startTimeDraft, setStartTimeDraft] = useState('')
    const [previewHeight, setPreviewHeight] = useState(260)
    const [selectedClipCollapsed, setSelectedClipCollapsed] = useState(false)

    // Refs
    const previewShellRef = useRef<HTMLElement>(null)
    const timelineScrollerRef = useRef<HTMLDivElement>(null)
    const animFrameRef = useRef<number>(0)
    const lastTimeRef = useRef<number>(0)
    const videoRef = useRef<HTMLVideoElement>(null)
    const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
    const latestTracksRef = useRef<Track[]>(tracks)

    useEffect(() => {
        const handleFullscreenChange = () => {
            const shell = previewShellRef.current
            const fullscreenElement = document.fullscreenElement
            setIsPreviewFullscreen(Boolean(shell && fullscreenElement && (shell === fullscreenElement || shell.contains(fullscreenElement))))
        }

        document.addEventListener('fullscreenchange', handleFullscreenChange)
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }, [])

    const syncTracksDraft = useCallback((nextTracks: Track[]) => {
        latestTracksRef.current = nextTracks
        onTracksChange?.(nextTracks)
    }, [onTracksChange])

    const setTracksWithSync = useCallback((updater: SetStateAction<Track[]>) => {
        setTracks((prev) => {
            const nextTracks = typeof updater === 'function'
                ? (updater as (prevState: Track[]) => Track[])(prev)
                : updater

            syncTracksDraft(nextTracks)
            return nextTracks
        })
    }, [syncTracksDraft])

    const updateClipInTrack = useCallback((clipId: string, updater: (clip: TimelineClip) => TimelineClip) => {
        setTracksWithSync(prev => prev.map(track => ({
            ...track,
            clips: track.clips.map(clip => clip.id === clipId ? updater(clip) : clip),
        })))
    }, [setTracksWithSync])

    useEffect(() => {
        if (initialTracks) {
            latestTracksRef.current = initialTracks
            setTracks(initialTracks)
        }
    }, [initialTracks])

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
    const activeAudioClips = useMemo(
        () => tracks.flatMap((track) => {
            if (track.type !== 'audio') return []
            return track.clips.filter((clip) => playheadTime >= clip.startTime && playheadTime < getClipEnd(clip))
        }),
        [tracks, playheadTime]
    )
    const selectedClip = useMemo(
        () => tracks.flatMap(track => track.clips).find(clip => clip.id === selectedClipId) ?? null,
        [tracks, selectedClipId]
    )
    const selectedClipIdSet = useMemo(() => new Set(selectedClipIds), [selectedClipIds])
    const totalImageClipCount = useMemo(
        () => tracks.reduce((count, track) => count + track.clips.filter((clip) => clip.fileType === 'image').length, 0),
        [tracks]
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

    const selectSingleClip = useCallback((clipId: string) => {
        setSelectedClipId(clipId)
        setSelectedClipIds([clipId])
        setSelectionAnchorClipId(clipId)
    }, [])

    const selectClipRange = useCallback((clipId: string, extendSelection: boolean) => {
        if (!extendSelection) {
            selectSingleClip(clipId)
            return
        }

        const targetLocated = getTrackForClip(clipId)
        const anchorId = selectionAnchorClipId
        const anchorLocated = anchorId ? getTrackForClip(anchorId) : null

        if (
            !targetLocated
            || !anchorLocated
            || targetLocated.track.id !== anchorLocated.track.id
            || targetLocated.clip.fileType !== 'image'
            || anchorLocated.clip.fileType !== 'image'
        ) {
            selectSingleClip(clipId)
            return
        }

        const sortedImageClips = [...targetLocated.track.clips]
            .filter((clip) => clip.fileType === 'image')
            .sort((a, b) => a.startTime - b.startTime)
        const anchorIndex = sortedImageClips.findIndex((clip) => clip.id === anchorLocated.clip.id)
        const targetIndex = sortedImageClips.findIndex((clip) => clip.id === targetLocated.clip.id)

        if (anchorIndex === -1 || targetIndex === -1) {
            selectSingleClip(clipId)
            return
        }

        const startIndex = Math.min(anchorIndex, targetIndex)
        const endIndex = Math.max(anchorIndex, targetIndex)
        const rangeIds = sortedImageClips.slice(startIndex, endIndex + 1).map((clip) => clip.id)

        setSelectedClipId(clipId)
        setSelectedClipIds(rangeIds)
    }, [getTrackForClip, selectSingleClip, selectionAnchorClipId])

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

    const reorderSelectedClip = useCallback((direction: -1 | 1) => {
        if (!selectedClipId) return

        setTracksWithSync(prev => prev.map((track) => {
            if (!track.clips.some((clip) => clip.id === selectedClipId)) {
                return track
            }

            return reorderClipOnTrack(track, selectedClipId, direction)
        }))
    }, [selectedClipId, setTracksWithSync])

    const selectedClipReorderState = useMemo(() => {
        if (!selectedClipId) {
            return {
                canMoveEarlier: false,
                canMoveLater: false,
            }
        }

        const located = getTrackForClip(selectedClipId)
        if (!located) {
            return {
                canMoveEarlier: false,
                canMoveLater: false,
            }
        }

        const sortedClips = [...located.track.clips].sort((a, b) => a.startTime - b.startTime)
        const clipIndex = sortedClips.findIndex((clip) => clip.id === selectedClipId)

        return {
            canMoveEarlier: clipIndex > 0,
            canMoveLater: clipIndex !== -1 && clipIndex < sortedClips.length - 1,
        }
    }, [getTrackForClip, selectedClipId])

    const handleExport = useCallback(async () => {
        if (!onExport || isExporting) return

        setIsExporting(true)
        setExportMessage(null)

        try {
            const result = await onExport({
                tracks,
                totalDuration,
            })

            if (result.canceled) {
                setExportMessage('Export canceled.')
            } else if (!result.success) {
                setExportMessage(result.error || 'Failed to export timeline.')
            } else {
                setExportMessage(result.outputPath ? `Exported: ${result.outputPath}` : 'Export completed.')
            }
        } catch (error) {
            setExportMessage(error instanceof Error ? error.message : 'Failed to export timeline.')
        } finally {
            setIsExporting(false)
        }
    }, [isExporting, onExport, totalDuration, tracks])

    const togglePreviewFullscreen = useCallback(async () => {
        const shell = previewShellRef.current
        if (!shell) return

        try {
            if (document.fullscreenElement) {
                await document.exitFullscreen()
            } else {
                await shell.requestFullscreen()
            }
        } catch (error) {
            console.error('Failed to toggle timeline preview fullscreen', error)
        }
    }, [])

    const handleBack = useCallback(() => {
        syncTracksDraft(latestTracksRef.current)
        onBack()
    }, [onBack, syncTracksDraft])

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

    const updateAllImageClipLengths = useCallback((requestedLength: number) => {
        const nextDuration = Math.max(MIN_CLIP_DURATION, requestedLength)

        setTracksWithSync(prev => prev.map((track) => {
            if (!track.clips.some((clip) => clip.fileType === 'image')) {
                return track
            }

            const nextTrack: Track = {
                ...track,
                clips: track.clips.map((clip) => clip.fileType === 'image'
                    ? { ...clip, duration: nextDuration }
                    : clip),
            }

            return track.type === 'video' ? compactTrackClips(nextTrack) : nextTrack
        }))
    }, [setTracksWithSync])

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
        const activeAudioIds = new Set(activeAudioClips.map((clip) => clip.id))

        Object.entries(audioRefs.current).forEach(([clipId, element]) => {
            if (!element) return

            if (!activeAudioIds.has(clipId)) {
                element.pause()
                return
            }

            const clip = activeAudioClips.find((entry) => entry.id === clipId)
            if (!clip) return

            const clipTime = playheadTime - clip.startTime + clip.trimStart
            if (Math.abs(element.currentTime - clipTime) > 0.5) {
                element.currentTime = clipTime
            }

            if (isPlaying && element.paused) {
                element.play().catch(() => { })
            } else if (!isPlaying && !element.paused) {
                element.pause()
            }
        })
    }, [activeAudioClips, isPlaying, playheadTime])

    // --- Track/Clip Operations ---
    const deleteClip = useCallback((clipId: string) => {
        setTracksWithSync(prev => prev.map(track => {
            const remainingClips = track.clips.filter(c => c.id !== clipId)
            if (remainingClips.length === track.clips.length) {
                return track
            }

            return track.type === 'video'
                ? compactTrackClips({
                    ...track,
                    clips: remainingClips,
                })
                : {
                    ...track,
                    clips: remainingClips,
                }
        }))
        if (selectedClipId === clipId) {
            setSelectedClipId(null)
            setSelectedClipIds([])
            setSelectionAnchorClipId(null)
        }
    }, [selectedClipId, setTracksWithSync])

    const closeTrackGaps = useCallback(() => {
        setTracksWithSync(prev => prev.map(track => track.type === 'video' ? compactTrackClips(track) : track))
    }, [setTracksWithSync])

    const duplicateSelectedClip = useCallback(() => {
        if (!selectedClipId) return

        const selectedRangeIds = selectedClipIds.filter((id) => id !== selectedClipId ? selectedClipIdSet.has(id) : true)
        const located = getTrackForClip(selectedClipId)

        if (located && selectedRangeIds.length > 1 && located.clip.fileType === 'image') {
            const trackId = located.track.id
            let duplicatedIds: string[] = []

            setTracksWithSync(prev => prev.map((track) => {
                if (track.id !== trackId) {
                    return track
                }

                const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime)
                const selectedClips = sortedClips.filter((clip) => selectedClipIdSet.has(clip.id))

                if (selectedClips.length <= 1) {
                    return track
                }

                const insertionStart = getClipEnd(selectedClips[selectedClips.length - 1])
                duplicatedIds = selectedClips.map(() => generateClipId())
                const duplicatedClips = selectedClips.map((clip, index) => ({
                    ...clip,
                    id: duplicatedIds[index],
                    startTime: insertionStart + (clip.startTime - selectedClips[0].startTime),
                }))

                return {
                    ...track,
                    clips: [...track.clips, ...duplicatedClips].sort((a, b) => a.startTime - b.startTime),
                }
            }))

            if (duplicatedIds.length > 0) {
                setSelectedClipId(duplicatedIds[duplicatedIds.length - 1])
                setSelectedClipIds(duplicatedIds)
                setSelectionAnchorClipId(duplicatedIds[0])
            }
            return
        }

        let duplicatedId: string | null = null
        setTracksWithSync(prev => prev.map(track => {
            if (!track.clips.some((clip) => clip.id === selectedClipId)) {
                return track
            }

            const result = duplicateClipOnTrack(track, selectedClipId)
            duplicatedId = result.duplicatedId
            return result.track
        }))

        if (duplicatedId) {
            setSelectedClipId(duplicatedId)
            setSelectedClipIds([duplicatedId])
            setSelectionAnchorClipId(duplicatedId)
        }
    }, [getTrackForClip, selectedClipId, selectedClipIdSet, selectedClipIds, setTracksWithSync])

    const splitClipAtPlayhead = useCallback(() => {
        if (!selectedClipId) return

        let nextSelectedClipId: string | null = selectedClipId

        setTracksWithSync(prev => {
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
        setSelectedClipIds(nextSelectedClipId ? [nextSelectedClipId] : [])
        setSelectionAnchorClipId(nextSelectedClipId)
    }, [selectedClipId, playheadTime, setTracksWithSync])

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

            setTracksWithSync(prev => prev.map(t =>
                t.id === trackId ? { ...t, clips: [...t.clips, newClip] } : t
            ))
        } catch (e) {
            console.error('Failed to import media:', e)
        }
    }, [setTracksWithSync, tracks])

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

    const handlePreviewResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()

        const startY = e.clientY
        const startHeight = previewHeight

        const onMove = (event: MouseEvent) => {
            const delta = event.clientY - startY
            setPreviewHeight(clamp(startHeight + delta, 120, 360))
        }

        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }, [previewHeight])

    // --- Clip drag (reposition) ---
    const handleClipDragStart = useCallback((clipId: string, e: React.MouseEvent) => {
        e.stopPropagation()
        if (e.shiftKey) {
            return
        }

        selectSingleClip(clipId)

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
        const trackRows = Array.from(timelineScrollerRef.current?.querySelectorAll<HTMLElement>('.timeline-track') ?? [])
        const firstAudioTrackIndex = tracks.findIndex((entry) => entry.type === 'audio')

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX
            const dt = dx / zoom

            // Calculate proposed new start
            let newStart = origStart + dt

            // Snap to 0.05s grid
            newStart = Math.round(newStart * 20) / 20

            // Boundary check (>= 0)
            if (newStart < 0) newStart = 0

            let targetTrackId = clip!.trackId
            if (clip!.fileType === 'audio' && firstAudioTrackIndex !== -1) {
                const hoveredTrackIndex = trackRows.findIndex((row) => {
                    const rect = row.getBoundingClientRect()
                    return ev.clientY >= rect.top && ev.clientY <= rect.bottom
                })

                if (hoveredTrackIndex >= firstAudioTrackIndex && hoveredTrackIndex < tracks.length) {
                    const hoveredTrack = tracks[hoveredTrackIndex]
                    if (hoveredTrack.type === 'audio') {
                        targetTrackId = hoveredTrack.id
                    }
                } else if (trackRows.length > 0 && ev.clientY > trackRows[trackRows.length - 1].getBoundingClientRect().bottom) {
                    const currentAudioTrackCount = tracks.filter((entry) => entry.type === 'audio').length
                    targetTrackId = `audio-${currentAudioTrackCount + 1}`
                }
            }

            const nextTracks = ensureAudioTrackExists(tracks, targetTrackId)
            const targetTrack = nextTracks.find((entry) => entry.id === targetTrackId) ?? track

            if (!hasTrackCollision(targetTrack, clipId, newStart, effectiveDur)) {
                if (targetTrackId !== clip!.trackId || Math.abs(newStart - clip!.startTime) > 0.001) {
                    if (targetTrackId !== clip!.trackId) {
                        setTracksWithSync(prev => moveClipToTrackAtTime(prev, clipId, targetTrackId, newStart))
                    } else {
                        updateClipInTrack(clipId, c => ({ ...c, startTime: newStart }))
                    }
                }
            }
        }

        const onUp = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }, [selectSingleClip, setTracksWithSync, tracks, updateClipInTrack, zoom])

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
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

            if (selectedClipId && e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault()
                reorderSelectedClip(-1)
                return
            }

            if (selectedClipId && e.altKey && e.key === 'ArrowRight') {
                e.preventDefault()
                reorderSelectedClip(1)
                return
            }

            if (e.key === ' ') { e.preventDefault(); togglePlayback() }
            if (e.key === 'Delete' && selectedClipId) { deleteClip(selectedClipId) }
            if (e.key === 's' || e.key === 'S') { splitClipAtPlayhead() }
            if ((e.key === 'd' || e.key === 'D') && selectedClipId) { e.preventDefault(); duplicateSelectedClip() }
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [togglePlayback, selectedClipId, deleteClip, splitClipAtPlayhead, duplicateSelectedClip, reorderSelectedClip])

    // --- Render ---
    return (
        <div className="timeline-editor">
            {/* Toolbar */}
            <div className="timeline-toolbar">
                <div className="toolbar-left">
                    <button className="btn btn-secondary btn-sm" onClick={handleBack}>← Back</button>
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
                        onClick={() => reorderSelectedClip(-1)}
                        disabled={!selectedClipReorderState.canMoveEarlier}
                        title="Swap selected clip earlier in track order (Alt+←)"
                    >← Earlier</button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => reorderSelectedClip(1)}
                        disabled={!selectedClipReorderState.canMoveLater}
                        title="Swap selected clip later in track order (Alt+→)"
                    >Later →</button>
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
                        title="Duplicate selected clip or selected image range (D)"
                    >⧉ Duplicate</button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={closeTrackGaps}
                        disabled={tracks.filter((track) => track.type === 'video').every((track) => track.clips.length < 2)}
                        title="Shift video/image clips left to fill empty gaps"
                    >⇤ Close Gaps</button>
                    <button className="btn btn-secondary btn-sm" onClick={addExternalMedia}>
                        📎 Add Media
                    </button>
                    {onExport ? (
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleExport}
                            disabled={isExporting}
                            title="Export timeline"
                        >{isExporting ? '⏳ Exporting…' : '⬇ Export'}</button>
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
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={togglePreviewFullscreen}
                        title={isPreviewFullscreen ? 'Exit preview fullscreen' : 'Enter preview fullscreen'}
                    >{isPreviewFullscreen ? '🡼 Window' : '⛶ Fullscreen'}</button>
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
            {exportMessage && <div className="timeline-export-status">{exportMessage}</div>}

            <div className={`timeline-inspector ${selectedClipCollapsed ? 'is-collapsed' : ''}`}>
                <div className="inspector-header">
                    <div>
                        <p className="inspector-eyebrow">Selected clip</p>
                        <h2>{selectedClip ? getFileName(selectedClip.fileName) : 'No clip selected'}</h2>
                    </div>
                    <div className="inspector-header-actions">
                        {selectedClip && (
                            <div className="inspector-badges">
                                <span className={`inspector-badge badge-${selectedClip.fileType}`}>{selectedClip.fileType}</span>
                                <span className="inspector-badge">Length {formatTime(getEffectiveDuration(selectedClip))}</span>
                                {selectedClip.fileType !== 'image' && getSourceDuration(selectedClip) !== undefined && (
                                    <span className="inspector-badge">Source {formatTime(getSourceDuration(selectedClip) || 0)}</span>
                                )}
                            </div>
                        )}
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setSelectedClipCollapsed((prev) => !prev)}
                            aria-expanded={!selectedClipCollapsed}
                            title={selectedClipCollapsed ? 'Expand selected clip fields' : 'Collapse selected clip fields'}
                        >
                            {selectedClipCollapsed ? '▾ Expand' : '▴ Collapse'}
                        </button>
                    </div>
                </div>

                {!selectedClipCollapsed && (selectedClip ? (
                    <>
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
                                step={selectedClip.fileType === 'image' ? '0.01' : '0.05'}
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

                        {selectedClip.fileType === 'image' && (
                            <div className="timeline-field timeline-field-readonly">
                                <span className="timeline-field-label">Bulk apply</span>
                                <div className="timeline-field-value">
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        onClick={() => {
                                            const parsed = Number(durationDraft)
                                            if (!Number.isFinite(parsed)) {
                                                setDurationDraft(getEffectiveDuration(selectedClip).toFixed(2))
                                                return
                                            }

                                            updateAllImageClipLengths(parsed)
                                        }}
                                    >
                                        Apply to all image clips ({totalImageClipCount})
                                    </button>
                                </div>
                            </div>
                        )}

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
                    </>
                ) : (
                    <p className="inspector-empty">Pick a clip to edit its start, trim, and duration with exact values.</p>
                ))}
            </div>

            <div className="timeline-workspace">
                <section
                    ref={previewShellRef}
                    className={`timeline-preview-shell ${isPreviewFullscreen ? 'is-fullscreen' : ''}`}
                    style={{ height: selectedClipCollapsed ? Math.max(previewHeight, 300) : previewHeight }}
                >
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
                                        muted={activeAudioClips.length > 0}
                                    />
                                )
                            ) : (
                                <div className="preview-empty-state">
                                    <span className="empty-icon-large">🎬</span>
                                    <p>Move playhead over a clip to preview</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {activeAudioClips.map((clip) => (
                    <audio
                        key={clip.id}
                        ref={(element) => {
                            if (element) {
                                audioRefs.current[clip.id] = element
                            } else {
                                delete audioRefs.current[clip.id]
                            }
                        }}
                        src={buildLocalFileUrl(clip.filePath)}
                    />
                ))}

                <div
                    className="timeline-preview-resize-handle"
                    onMouseDown={handlePreviewResizeStart}
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize timeline preview"
                >
                    <div className="timeline-preview-resize-line" />
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
                                            className={`timeline-clip clip-${clip.fileType} ${selectedClipIdSet.has(clip.id) ? 'selected' : ''} ${activeVideoClip?.id === clip.id || activeAudioClips.some((activeClip) => activeClip.id === clip.id) ? 'active' : ''}`}
                                            style={{
                                                left: clipLeft,
                                                width: Math.max(20, clipWidth),
                                            }}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                selectClipRange(clip.id, e.shiftKey)
                                            }}
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
            </div>

            {/* Status Bar */}
            <div className="timeline-status">
                <span>Zoom: {zoom}px/s</span>
                <span>Duration: {formatTime(totalDuration)}</span>
                <span>Clips: {tracks.reduce((sum, t) => sum + t.clips.length, 0)}</span>
                {selectedClip && <span>Selected: {getFileName(selectedClip.fileName)}</span>}
                {selectedClipIds.length > 1 && <span>Range: {selectedClipIds.length} clips</span>}
                {selectedClip && <span>Length: {formatTime(getEffectiveDuration(selectedClip))}</span>}
                <span className="timeline-shortcuts-hint">
                    Space: Play/Pause · Shift+Click: Range Select · D: Duplicate · Alt+←/→: Reorder · Del: Delete
                </span>
            </div>
        </div>
    )
}
