import { useState, useEffect, useCallback, useMemo } from 'react'
import './index.css'
import { FileList } from './components/FileList'
import { VideoPreview } from './components/VideoPreview'
import { PlayQueue } from './components/PlayQueue'
import { Sidebar } from './components/Sidebar'
import { KeyInput } from './components/KeyInput'
import { UserGuide } from './components/UserGuide'
import { TimelineEditor } from './components/timeline/TimelineEditor'
import type { TimelineSourceClip } from './components/timeline/TimelineEditor'
import type { TimelineExportProject } from './components/timeline/TimelineEditor'
import { measureMediaSourceDuration } from './components/timeline/mediaUtils'
import { ErrorBoundary } from './components/ErrorBoundary'

import { useArchive, usePlaylist } from './hooks'
import { useUIStore } from './stores'
import type { ArchiveFile, ArchiveInfo, QueueItem } from './stores'

type FilterType = 'all' | 'video' | 'image' | 'audio'
type AppView = 'extractor' | 'timeline'
type NavigationTarget = 'files' | 'queue'
type ExtractFileWithOutput = (
  archivePath: string,
  filename: string,
  key?: string,
  outputDir?: string,
) => Promise<{ success: boolean; outputPath?: string; type?: string; error?: string }>

type ExportTimelineApi = (project: Record<string, unknown>) => Promise<{
  success: boolean
  canceled?: boolean
  outputPath?: string
  error?: string
}>

function getBaseName(path: string): string {
  return path.split('/').pop()?.split('\\').pop() ?? path
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\\/_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenizeSearchText(value: string): string[] {
  return normalizeSearchText(value).split(' ').filter(Boolean)
}

function rankFileSearchMatch(file: ArchiveFile, normalizedQuery: string, queryTokens: string[]): number | null {
  if (!normalizedQuery) {
    return 0
  }

  const baseName = getBaseName(file.name)
  const normalizedBaseName = normalizeSearchText(baseName)
  const normalizedFullName = normalizeSearchText(file.name)
  const normalizedPath = normalizeSearchText(file.path)
  const baseTokens = tokenizeSearchText(baseName)
  const fullTokens = tokenizeSearchText(file.name)

  let score = -1

  if (normalizedBaseName === normalizedQuery) {
    score = Math.max(score, 1200)
  }

  if (normalizedFullName === normalizedQuery) {
    score = Math.max(score, 1120)
  }

  if (baseTokens.includes(normalizedQuery)) {
    score = Math.max(score, 1080)
  }

  if (fullTokens.includes(normalizedQuery)) {
    score = Math.max(score, 1040)
  }

  if (normalizedBaseName.startsWith(normalizedQuery)) {
    score = Math.max(score, 1000 - Math.min(120, normalizedBaseName.length - normalizedQuery.length))
  }

  const basePhraseIndex = normalizedBaseName.indexOf(normalizedQuery)
  if (basePhraseIndex >= 0) {
    score = Math.max(score, 920 - (basePhraseIndex * 12))
  }

  const fullNamePhraseIndex = normalizedFullName.indexOf(normalizedQuery)
  if (fullNamePhraseIndex >= 0) {
    score = Math.max(score, 760 - (fullNamePhraseIndex * 6))
  }

  const matchedTokenCount = queryTokens.filter((token) =>
    fullTokens.some((fullToken) => fullToken === token || fullToken.startsWith(token))
  ).length

  if (matchedTokenCount === queryTokens.length && queryTokens.length > 1) {
    score = Math.max(score, 880 + (matchedTokenCount * 20))
  }

  const basePrefixMatches = queryTokens.filter((token) =>
    baseTokens.some((baseToken) => baseToken.startsWith(token))
  ).length

  if (basePrefixMatches > 0) {
    score = Math.max(score, 700 + (basePrefixMatches * 25))
  }

  const pathPhraseIndex = normalizedPath.indexOf(normalizedQuery)
  if (pathPhraseIndex >= 0) {
    score = Math.max(score, 420 - pathPhraseIndex)
  }

  return score >= 0 ? score : null
}

function App() {
  const extractFileWithOutput: ExtractFileWithOutput = window.api.extractFile.bind(window.api)
  const exportTimeline: ExportTimelineApi = (window.api as typeof window.api & { exportTimeline: ExportTimelineApi }).exportTimeline.bind(window.api)

  const {
    archives,
    selectedArchive,
    selectedFiles,
    isLoading,
    error,
    setError,
    scanFolder,
    scanArchive,
    removeArchive,
    selectFile,
  } = useArchive()

  const {
    queue,
    currentIndex,
    addSelectedToQueue,
    playItem,
    removeFromQueue,
    clearQueue,
    moveItem,
    updateQueueItem,
    playNext,
    playPrevious,
    handleVideoEnded,
  } = usePlaylist()

  const {
    viewMode,
    searchQuery,
    sidebarCollapsed,
    setViewMode,
    setSearchQuery,
    toggleSidebar,
    showUserGuide,
    toggleUserGuide,
  } = useUIStore()

  const [localTimelineClips, setLocalTimelineClips] = useState<TimelineSourceClip[]>([])
  const [showQueue, setShowQueue] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [appView, setAppView] = useState<AppView>('extractor')
  const [fileListWidth, setFileListWidth] = useState(360)
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [hexKey, setHexKey] = useState('')
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [autoPlayNext, setAutoPlayNext] = useState(false)
  const [previewSource, setPreviewSource] = useState<'selection' | 'queue'>('selection')
  const [navTarget, setNavTarget] = useState<NavigationTarget>('files')
  const [queueLoopPass, setQueueLoopPass] = useState(1)
  const [previewReplayToken, setPreviewReplayToken] = useState(0)

  const files = selectedArchive?.files ?? []
  const selectedFilesList = useMemo(
    () => files.filter((file) => selectedFiles.has(file.path)),
    [files, selectedFiles]
  )

  const selectedFile = selectedFilesList[0] ?? null
  const currentQueueItem = currentIndex >= 0 ? queue[currentIndex] ?? null : null
  const activePreviewItem = previewSource === 'queue'
    ? currentQueueItem ?? selectedFile
    : selectedFile ?? currentQueueItem

  const filteredFiles = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchQuery)
    const queryTokens = tokenizeSearchText(searchQuery)

    const typeFilteredFiles = files.filter((file) => filterType === 'all' || file.type === filterType)

    if (!normalizedQuery) {
      return typeFilteredFiles
    }

    return typeFilteredFiles
      .map((file, index) => ({
        file,
        index,
        rank: rankFileSearchMatch(file, normalizedQuery, queryTokens),
      }))
      .filter((entry): entry is { file: ArchiveFile; index: number; rank: number } => entry.rank !== null)
      .sort((a, b) => {
        if (b.rank !== a.rank) {
          return b.rank - a.rank
        }

        return a.index - b.index
      })
      .map((entry) => entry.file)
  }, [files, filterType, searchQuery])

  const effectiveNavTarget: NavigationTarget = navTarget === 'queue' && queue.length > 0 ? 'queue' : 'files'
  const navList = effectiveNavTarget === 'queue' ? queue : filteredFiles

  const handleSelectFolder = useCallback(async () => {
    const result = await window.api.selectFolder()
    if (result.success && result.path) {
      await scanFolder(result.path)
    }
  }, [scanFolder])

  const handleSelectArchive = useCallback(async (archive: ArchiveInfo) => {
    await scanArchive(archive.path)
  }, [scanArchive])

  const handleRemoveArchive = useCallback((archivePath: string) => {
    removeArchive(archivePath)
  }, [removeArchive])

  const handleSelectFile = useCallback((file: ArchiveFile, e: React.MouseEvent) => {
    setPreviewSource('selection')
    setNavTarget('files')
    selectFile(file.path, e.ctrlKey || e.metaKey, e.shiftKey)
  }, [selectFile])

  const handleAddToQueue = useCallback(() => {
    addSelectedToQueue()
    setShowQueue(true)
  }, [addSelectedToQueue])

  const handlePlayQueueItem = useCallback((index: number) => {
    setPreviewSource('queue')
    setNavTarget('queue')
    setQueueLoopPass(1)
    playItem(index)
  }, [playItem])

  const handleRemoveFromQueue = useCallback((index: number) => {
    setNavTarget('queue')
    removeFromQueue(index)
  }, [removeFromQueue])

  const handleClearQueue = useCallback(() => {
    setNavTarget('files')
    clearQueue()
  }, [clearQueue])

  const handleMoveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    setNavTarget('queue')
    moveItem(fromIndex, toIndex)
  }, [moveItem])

  const handleUpdateQueueItem = useCallback((index: number, updates: Partial<QueueItem>) => {
    setNavTarget('queue')
    updateQueueItem(index, updates)
  }, [updateQueueItem])

  const handlePlayAll = useCallback(() => {
    if (queue.length === 0) return
    setPreviewSource('queue')
    setNavTarget('queue')
    setQueueLoopPass(1)
    playItem(0)
    setAutoPlayNext(true)
  }, [playItem, queue.length])

  const handleExtractQueue = useCallback(async () => {
    if (!selectedArchive || queue.length === 0) return

    const output = await window.api.selectOutputFolder()
    if (!output.success || !output.path) return

    for (const file of queue) {
      await extractFileWithOutput(selectedArchive.path, file.name, hexKey, output.path)
    }
  }, [hexKey, queue, selectedArchive])

  const handleExtractAll = useCallback(async () => {
    if (!selectedArchive) return

    const output = await window.api.selectOutputFolder()
    if (!output.success || !output.path) return

    await window.api.extractAll(
      selectedArchive.path,
      output.path,
      hexKey,
      filterType === 'all' ? undefined : filterType,
    )
  }, [filterType, hexKey, selectedArchive])

  const handleExtractSelected = useCallback(async () => {
    if (!selectedArchive || !selectedFile) return

    const output = await window.api.selectOutputFolder()
    if (!output.success || !output.path) return

    await extractFileWithOutput(selectedArchive.path, selectedFile.name, hexKey, output.path)
  }, [hexKey, selectedArchive, selectedFile])

  const handleExtractPreview = useCallback(async () => {
    if (!selectedArchive || !activePreviewItem) return

    const output = await window.api.selectOutputFolder()
    if (!output.success || !output.path) return

    await extractFileWithOutput(selectedArchive.path, activePreviewItem.name, hexKey, output.path)
  }, [activePreviewItem, hexKey, selectedArchive])

  const handleNextFileCallback = useCallback(() => {
    if (effectiveNavTarget === 'queue') {
      setPreviewSource('queue')
      setQueueLoopPass(1)
      playNext()
      return
    }

    if (filteredFiles.length === 0) return
    const currentSelectedIndex = selectedFile
      ? filteredFiles.findIndex((file) => file.path === selectedFile.path)
      : -1
    const nextIndex = currentSelectedIndex >= 0
      ? (currentSelectedIndex + 1) % filteredFiles.length
      : 0

    setPreviewSource('selection')
    selectFile(filteredFiles[nextIndex].path)
  }, [effectiveNavTarget, filteredFiles, playNext, selectFile, selectedFile])

  const handlePrevFileCallback = useCallback(() => {
    if (effectiveNavTarget === 'queue') {
      setPreviewSource('queue')
      setQueueLoopPass(1)
      playPrevious()
      return
    }

    if (filteredFiles.length === 0) return
    const currentSelectedIndex = selectedFile
      ? filteredFiles.findIndex((file) => file.path === selectedFile.path)
      : -1
    const prevIndex = currentSelectedIndex > 0
      ? currentSelectedIndex - 1
      : filteredFiles.length - 1

    setPreviewSource('selection')
    selectFile(filteredFiles[prevIndex].path)
  }, [effectiveNavTarget, filteredFiles, playPrevious, selectFile, selectedFile])

  const handleVideoEndedCallback = useCallback(() => {
    if (!autoPlayNext) return

    if (queue.length > 0) {
      setPreviewSource('queue')

      const loopTarget = Math.max(1, currentQueueItem?.loopCount ?? 1)
      if (currentQueueItem && queueLoopPass < loopTarget) {
        setQueueLoopPass((prev) => prev + 1)
        setPreviewReplayToken((prev) => prev + 1)
        return
      }

      setQueueLoopPass(1)
      handleVideoEnded()
      return
    }

    handleNextFileCallback()
  }, [autoPlayNext, currentQueueItem, handleNextFileCallback, handleVideoEnded, queue.length, queueLoopPass])

  useEffect(() => {
    setQueueLoopPass(1)
  }, [currentQueueItem?.id])

  useEffect(() => {
    if (queue.length === 0 && navTarget === 'queue') {
      setNavTarget('files')
    }
  }, [navTarget, queue.length])

  useEffect(() => {
    let cancelled = false

    const loadPreview = async () => {
      if (!selectedArchive || !activePreviewItem) {
        setPreviewPath(null)
        setPreviewLoading(false)
        return
      }

      setPreviewLoading(true)

      try {
        const result = await window.api.extractFile(selectedArchive.path, activePreviewItem.name, hexKey)
        if (!cancelled) {
          setPreviewPath(result.success ? result.outputPath || null : null)
        }
      } catch {
        if (!cancelled) {
          setPreviewPath(null)
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      }
    }

    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [activePreviewItem, hexKey, selectedArchive])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        handleNextFileCallback()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrevFileCallback()
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        handleAddToQueue()
      } else if (e.key === '?') {
        e.preventDefault()
        toggleUserGuide()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleAddToQueue, handleNextFileCallback, handlePrevFileCallback, toggleUserGuide])

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = fileListWidth

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const newWidth = Math.max(220, Math.min(600, startWidth + delta))
      setFileListWidth(newWidth)
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [fileListWidth])

  const currentNavIndex = effectiveNavTarget === 'queue'
    ? currentIndex
    : (selectedFile ? navList.findIndex((file) => file.path === selectedFile.path) : -1)
  const totalNavItems = navList.length

  const handleOpenEditor = useCallback(async () => {
    if (!selectedArchive || queue.length === 0) return

    const clips: TimelineSourceClip[] = []
    for (const file of queue) {
      try {
        const result = await window.api.extractFile(
          selectedArchive.path,
          file.name,
          hexKey,
        )

        if (result.success && result.outputPath) {
          const sourceDuration = await measureMediaSourceDuration(result.outputPath, file.type)
          const repeatCount = Math.max(1, file.loopCount || 1)

          for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
            clips.push({ file, path: result.outputPath, sourceDuration })
          }
        }
      } catch (e) {
        console.error(`Failed to extract ${file.name} for timeline:`, e)
      }
    }

    if (clips.length > 0) {
      setLocalTimelineClips(clips)
      setAppView('timeline')
    }
  }, [hexKey, queue, selectedArchive])

  const handleTimelineExport = useCallback(async (project: TimelineExportProject) => {
    const result = await exportTimeline(project as unknown as Record<string, unknown>)

    if (!result.success && !result.canceled) {
      setError(result.error || 'Timeline export failed.')
    }

    return result
  }, [exportTimeline, setError])

  if (appView === 'timeline') {
    return (
      <TimelineEditor
        initialClips={localTimelineClips}
        onBack={() => setAppView('extractor')}
        onExport={handleTimelineExport}
      />
    )
  }

  return (
    <ErrorBoundary>
      <div className="app">
        <Sidebar
          archives={archives}
          selectedArchive={selectedArchive}
          collapsed={sidebarCollapsed}
          onSelectFolder={handleSelectFolder}
          onSelectArchive={handleSelectArchive}
          onRemoveArchive={handleRemoveArchive}
          onShowKeyInput={() => setShowKeyInput(true)}
          onToggleCollapse={toggleSidebar}
          encryptionKey={hexKey}
        />

        <main className="main-content">
          {error && (
            <div className="error-banner">
              <span className="error-icon">⚠️</span>
              <span>{error}</span>
              <button className="error-close" onClick={() => setError(null)}>✖</button>
            </div>
          )}

          {isLoading && <div className="loading-overlay"><div className="spinner"></div></div>}

          <div className="content-panels">
            <div className="file-list-wrapper" style={{ width: fileListWidth, minWidth: 220, maxWidth: 600 }}>
              <FileList
                files={filteredFiles}
                totalFiles={files.length}
                selectedFile={selectedFile}
                selectedFiles={selectedFilesList}
                archiveVersion=""
                filterType={filterType}
                viewMode={viewMode}
                onFilterChange={setFilterType}
                onViewModeChange={setViewMode}
                onSelectFile={handleSelectFile}
                onExtractAll={handleExtractAll}
                onExtractSelected={handleExtractSelected}
                onQueueSelected={handleAddToQueue}
                onOpenHelp={toggleUserGuide}
                hasArchive={!!selectedArchive}
                extracting={isLoading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />
            </div>

            <div className="resize-handle" onMouseDown={handleResizeStart}>
              <div className="resize-handle-line"></div>
            </div>

            <div className={`right-panel ${showQueue ? 'has-queue' : ''}`}>
              <VideoPreview
                filePath={previewPath}
                fileType={activePreviewItem?.type || 'other'}
                fileName={activePreviewItem?.name || null}
                isLoading={previewLoading}
                autoPlayNext={autoPlayNext}
                onToggleAutoPlay={() => setAutoPlayNext(!autoPlayNext)}
                onNext={handleNextFileCallback}
                onPrev={handlePrevFileCallback}
                onExtract={handleExtractPreview}
                navIndex={currentNavIndex}
                navTotal={totalNavItems}
                onAddToQueue={handleAddToQueue}
                hasSelection={selectedFilesList.length > 0}
                onToggleQueue={() => setShowQueue(!showQueue)}
                showQueue={showQueue}
                queueLength={queue.length}
                previewSource={previewSource}
                navigationTarget={effectiveNavTarget}
                onEnded={handleVideoEndedCallback}
                triggerReplay={previewReplayToken}
              />

              {showQueue && (
                <PlayQueue
                  queue={queue}
                  currentIndex={currentIndex}
                  onMoveItem={handleMoveQueueItem}
                  onPlay={handlePlayQueueItem}
                  onRemove={handleRemoveFromQueue}
                  onClear={handleClearQueue}
                  onPlayAll={handlePlayAll}
                   onExtractQueue={handleExtractQueue}
                   extracting={isLoading}
                   onOpenEditor={handleOpenEditor}
                   onUpdateQueueItem={handleUpdateQueueItem}
                   onInteract={() => setNavTarget('queue')}
                 />
               )}
            </div>
          </div>
        </main>

        {showKeyInput && (
          <KeyInput
            currentKey={hexKey}
            onApply={(key) => {
              setHexKey(key)
              setShowKeyInput(false)
            }}
            onClose={() => setShowKeyInput(false)}
          />
        )}
        {showUserGuide && <UserGuide onClose={toggleUserGuide} />}
      </div>
    </ErrorBoundary>
  )
}

export default App
