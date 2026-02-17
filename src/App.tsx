import { useState, useEffect, useCallback, useMemo } from 'react'
import './index.css'
import { FileList } from './components/FileList'
import { VideoPreview } from './components/VideoPreview'
import { PlayQueue } from './components/PlayQueue'
import { Sidebar } from './components/Sidebar'
import { KeyInput } from './components/KeyInput'
import { UserGuide } from './components/UserGuide'
import { TimelineEditor } from './components/timeline/TimelineEditor'

// Interfaces mapping to IPC results
interface Archive {
  path: string
  name: string
  size: number
  relative: string
}

interface RPAFile {
  name: string
  size: number
  type: 'video' | 'image' | 'audio' | 'other'
  parts: number
}

interface QueueItem extends RPAFile {
  loopCount: number
}

function App() {
  // Data State
  const [archives, setArchives] = useState<Archive[]>([])
  const [selectedArchive, setSelectedArchive] = useState<Archive | null>(null)
  const [files, setFiles] = useState<RPAFile[]>([])

  // Selection State
  const [selectedFile, setSelectedFile] = useState<RPAFile | null>(null)       // active preview
  const [selectedFiles, setSelectedFiles] = useState<RPAFile[]>([])            // multi-select

  // Playlist State
  const [playlist, setPlaylist] = useState<QueueItem[]>([])
  const [playIndex, setPlayIndex] = useState(-1)
  const [currentLoop, setCurrentLoop] = useState(1) // Track current loop iteration

  // Preview Loop State
  const [previewPath, setPreviewPath] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [triggerReplay, setTriggerReplay] = useState(0) // Signal to replay current video

  // ... (UI State omitted for brevity, keeping same)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [showKeyInput, setShowKeyInput] = useState(false)
  const [showQueue, setShowQueue] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [extractProgress, setExtractProgress] = useState('')
  const [appView, setAppView] = useState<'extractor' | 'timeline'>('extractor')
  const [timelineClips, setTimelineClips] = useState<{ file: any; path: string }[]>([])

  // Settings State
  const [hexKey, setHexKey] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list')
  const [autoPlayNext, setAutoPlayNext] = useState(false)

  // Resize state
  const [fileListWidth, setFileListWidth] = useState(340)

  // Filter State
  const [filterType, setFilterType] = useState<'all' | 'video' | 'image' | 'audio'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Derived State (memoized for performance)
  const filteredFiles = useMemo(() => files.filter(f => {
    // 1. Filter by type
    if (filterType !== 'all' && f.type !== filterType) return false

    // 2. Filter by search query
    if (searchQuery) {
      return f.name.toLowerCase().includes(searchQuery.toLowerCase())
    }

    return true
  }), [files, filterType, searchQuery])

  // Active navigation list: playlist if active, otherwise filtered files
  const navList = playlist.length > 0 ? playlist : filteredFiles

  // --- Auto-extract preview when file is selected ---
  useEffect(() => {
    let cancelled = false

    const loadPreview = async () => {
      if (!selectedFile || !selectedArchive) {
        setPreviewPath(null)
        return
      }

      setPreviewLoading(true)
      setPreviewPath(null)

      try {
        const result = await (window.api as any).extractFile(
          selectedArchive.path,
          selectedFile.name,
          hexKey
        )

        if (!cancelled && result.success && result.outputPath) {
          setPreviewPath(result.outputPath)
        } else if (!cancelled) {
          console.error('Failed to extract for preview:', result.error)
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Preview extraction error:', e)
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false)
        }
      }
    }

    loadPreview()

    return () => {
      cancelled = true
    }
  }, [selectedFile, selectedArchive, hexKey])

  // --- Actions ---
  // ... (handleSelectFolder, handleSelectArchive omitted - keeping same)

  const handleSelectFolder = async () => {
    setLoading(true)
    setError(null)
    setArchives([])
    setFiles([])
    setSelectedArchive(null)
    setSelectedFile(null)
    setSelectedFiles([])
    setPlaylist([])
    setPlayIndex(-1)
    setCurrentLoop(1)

    try {
      const result = await window.api.selectFolder()
      if (result.success && result.path) {
        const scanResult = await window.api.scanFolder(result.path)
        if (scanResult.success && scanResult.archives) {
          setArchives(scanResult.archives)
        } else {
          setError(scanResult.error || 'Failed to scan folder')
        }
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectArchive = async (archive: Archive) => {
    setSelectedArchive(archive)
    setLoading(true)
    setError(null)
    setFiles([])
    setSelectedFile(null)
    setSelectedFiles([])
    setPlaylist([])
    setPlayIndex(-1)
    setCurrentLoop(1)

    try {
      const listResult = await window.api.listArchive(archive.path, hexKey)
      if (listResult.success && listResult.files) {
        const mappedFiles: RPAFile[] = listResult.files.map((f: any) => ({
          name: f.name,
          size: f.size,
          type: f.type,
          parts: f.parts
        }))
        setFiles(mappedFiles)
      } else {
        setError(listResult.error || 'Failed to list archive. Check encryption key.')
        if (listResult.error?.includes('zlib') || listResult.error?.includes('pickle')) {
          setShowKeyInput(true)
        }
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ... (handleSelectFile omitted - keeping same)
  const handleSelectFile = (file: RPAFile, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Toggle this file in selectedFiles
      setSelectedFiles(prev => {
        const exists = prev.some(f => f.name === file.name)
        if (exists) {
          return prev.filter(f => f.name !== file.name)
        } else {
          return [...prev, file]
        }
      })
      // Also set as active preview
      setSelectedFile(file)
    } else if (e.shiftKey && selectedFile) {
      // Range select
      const startIdx = filteredFiles.findIndex(f => f.name === selectedFile.name)
      const endIdx = filteredFiles.findIndex(f => f.name === file.name)
      if (startIdx >= 0 && endIdx >= 0) {
        const min = Math.min(startIdx, endIdx)
        const max = Math.max(startIdx, endIdx)
        const range = filteredFiles.slice(min, max + 1)
        setSelectedFiles(prev => {
          const existing = new Set(prev.map(f => f.name))
          const merged = [...prev]
          range.forEach(f => {
            if (!existing.has(f.name)) {
              merged.push(f)
            }
          })
          return merged
        })
      }
      setSelectedFile(file)
    } else {
      // Normal click - single select, clear multi-select
      setSelectedFile(file)
      setSelectedFiles([])
    }
  }

  // --- Playlist Actions ---
  const handleAddToQueue = useCallback(() => {
    // Helper to create QueueItem
    const toQueueItem = (f: RPAFile): QueueItem => ({ ...f, loopCount: 1 })

    if (selectedFiles.length === 0 && selectedFile) {
      setPlaylist(prev => {
        if (prev.some(f => f.name === selectedFile.name)) return prev
        return [...prev, toQueueItem(selectedFile)]
      })
    } else if (selectedFiles.length > 0) {
      setPlaylist(prev => {
        const existing = new Set(prev.map(f => f.name))
        const newItems = selectedFiles
          .filter(f => !existing.has(f.name))
          .map(toQueueItem)
        return [...prev, ...newItems]
      })
    }
    setShowQueue(true)
    setSelectedFiles([])
  }, [selectedFile, selectedFiles])

  const handleUpdateQueueItem = (index: number, updates: Partial<QueueItem>) => {
    setPlaylist(prev => {
      const next = [...prev]
      next[index] = { ...next[index], ...updates }
      return next
    })
  }

  const handlePlayQueueItem = (index: number) => {
    setPlayIndex(index)
    setSelectedFile(playlist[index])
    setCurrentLoop(1) // Reset loop on manual play
  }

  const handleRemoveFromQueue = (index: number) => {
    setPlaylist(prev => {
      const next = [...prev]
      next.splice(index, 1)
      return next
    })
    if (playIndex >= index) {
      // Adjust playIndex if we removed current or previous item
      if (playIndex === index) {
        setPlayIndex(-1) // stop playing if removed current
      } else {
        setPlayIndex(prev => prev - 1)
      }
    }
  }

  const handleClearQueue = () => {
    setPlaylist([])
    setPlayIndex(-1)
    setCurrentLoop(1)
  }

  const handleReorderQueue = (newQueue: QueueItem[]) => {
    setPlaylist(newQueue)
    // If playing, we need to find where the playing item moved (complex, simplifiction: stop or keep index?)
    // For now, keep index but it might point to different file. 
    // Ideally we track by ID/Name but duplicates allowed?
    // Let's just reset playIndex for simplicity or let user deal with it.
  }

  const handlePlayAll = () => {
    if (playlist.length === 0) return
    setPlayIndex(0)
    setSelectedFile(playlist[0])
    setCurrentLoop(1)
    setAutoPlayNext(true)
  }

  const handleExtractQueue = async () => {
    if (!selectedArchive || playlist.length === 0) return

    const folderResult = await window.api.selectOutputFolder()
    if (!folderResult.success || !folderResult.path) return

    setExtracting(true)
    setExtractProgress(`Extracting 0/${playlist.length}...`)
    let successCount = 0

    try {
      for (let i = 0; i < playlist.length; i++) {
        setExtractProgress(`Extracting ${i + 1}/${playlist.length}...`)
        try {
          const file = playlist[i]
          // Ensure we only use the filename, not the full internal path
          const baseName = file.name.split(/[/\\]/).pop()
          const outputName = `${i + 1}_${baseName}`

          const result = await (window.api as any).extractFile(
            selectedArchive.path,
            file.name,
            hexKey,
            folderResult.path,
            outputName
          )
          if (result.success) successCount++
        } catch (e) {
          console.error(`Failed to extract ${playlist[i].name}:`, e)
        }
      }
      alert(`Extracted ${successCount}/${playlist.length} queued files to ${folderResult.path}`)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExtracting(false)
      setExtractProgress('')
    }
  }

  // Navigation Logic — follows playlist if active, otherwise filtered files
  const handleNextFile = useCallback(() => {
    setCurrentLoop(1) // Reset loop on manual next
    if (playlist.length > 0) {
      const nextIdx = playIndex + 1
      if (nextIdx < playlist.length) {
        setPlayIndex(nextIdx)
        setSelectedFile(playlist[nextIdx])
      }
    } else {
      if (!selectedFile || filteredFiles.length === 0) return
      const currentIndex = filteredFiles.findIndex(f => f.name === selectedFile.name)
      if (currentIndex >= 0 && currentIndex < filteredFiles.length - 1) {
        setSelectedFile(filteredFiles[currentIndex + 1])
      }
    }
  }, [selectedFile, filteredFiles, playlist, playIndex])

  const handleVideoEnded = useCallback(() => {
    if (!autoPlayNext) return

    if (playlist.length > 0 && playIndex >= 0 && playIndex < playlist.length) {
      const item = playlist[playIndex]
      if (currentLoop < item.loopCount) {
        setCurrentLoop(prev => prev + 1)
        setTriggerReplay(prev => prev + 1) // Signal to replay
      } else {
        // Loop finished, go next
        setCurrentLoop(1)
        const nextIdx = playIndex + 1
        if (nextIdx < playlist.length) {
          setPlayIndex(nextIdx)
          setSelectedFile(playlist[nextIdx])
        }
      }
    } else {
      // Normal auto-next for file list (no looping supported there yet)
      handleNextFile()
    }
  }, [autoPlayNext, playlist, playIndex, currentLoop, handleNextFile])

  const handlePrevFile = useCallback(() => {
    setCurrentLoop(1) // Reset
    if (playlist.length > 0) {
      const prevIdx = playIndex - 1
      if (prevIdx >= 0) {
        setPlayIndex(prevIdx)
        setSelectedFile(playlist[prevIdx])
      }
    } else {
      if (!selectedFile || filteredFiles.length === 0) return
      const currentIndex = filteredFiles.findIndex(f => f.name === selectedFile.name)
      if (currentIndex > 0) {
        setSelectedFile(filteredFiles[currentIndex - 1])
      }
    }
  }, [selectedFile, filteredFiles, playlist, playIndex])

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        handleNextFile()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        handlePrevFile()
      } else if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault()
        handleAddToQueue()
      } else if (e.key === '?') {
        e.preventDefault()
        setShowGuide(g => !g)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNextFile, handlePrevFile, handleAddToQueue])


  const handleExtractAll = async () => {
    if (!selectedArchive) return

    const folderResult = await window.api.selectOutputFolder()
    if (!folderResult.success || !folderResult.path) return

    setExtracting(true)
    setError(null)
    try {
      const result = await window.api.extractAll(
        selectedArchive.path,
        folderResult.path,
        hexKey,
        filterType === 'all' ? undefined : filterType
      )

      if (result.success) {
        alert(`Successfully extracted ${result.extractedCount} files to ${folderResult.path}`)
      } else {
        setError(result.error || 'Extraction failed')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExtracting(false)
    }
  }

  const handleExtractSelected = async () => {
    if (!selectedArchive || !selectedFile) return

    const folderResult = await window.api.selectOutputFolder()
    if (!folderResult.success || !folderResult.path) return

    setExtracting(true)
    try {
      const result = await (window.api as any).extractFile(
        selectedArchive.path,
        selectedFile.name,
        hexKey,
        folderResult.path
      )

      if (result.success) {
        alert(`Extracted ${selectedFile.name} to ${folderResult.path}`)
      } else {
        setError(result.error || 'Failed to extract file')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setExtracting(false)
    }
  }

  // Resize handler
  const handleResizeStart = (e: React.MouseEvent) => {
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
  }

  const currentNavIndex = playlist.length > 0
    ? playIndex
    : (selectedFile ? navList.findIndex(f => f.name === selectedFile.name) : -1)
  const totalNavItems = navList.length

  // --- Open Timeline Editor ---
  const handleOpenEditor = async () => {
    if (!selectedArchive || playlist.length === 0) return
    // Extract all queued files to temp dir for timeline
    const clips: { file: any; path: string }[] = []
    for (const file of playlist) {
      try {
        const result = await (window.api as any).extractFile(
          selectedArchive.path,
          file.name,
          hexKey
        )
        if (result.success && result.outputPath) {
          clips.push({ file, path: result.outputPath })
        }
      } catch (e) {
        console.error(`Failed to extract ${file.name} for timeline:`, e)
      }
    }
    if (clips.length > 0) {
      setTimelineClips(clips)
      setAppView('timeline')
    }
  }

  // --- Timeline Editor View ---
  if (appView === 'timeline') {
    return (
      <TimelineEditor
        initialClips={timelineClips}
        onBack={() => setAppView('extractor')}
      />
    )
  }

  return (
    <div className="app">
      {/* Sidebar */}
      <Sidebar
        archives={archives}
        selectedArchive={selectedArchive}
        onSelectFolder={handleSelectFolder}
        onSelectArchive={handleSelectArchive}
        onShowKeyInput={() => setShowKeyInput(true)}
        encryptionKey={hexKey}
        folderPath={archives.length > 0 ? archives[0].path.split(/[\\/]/).slice(0, -1).join('/') : null}
      />

      {/* Main Content */}
      <main className="main-content">
        {error && (
          <div className="error-banner">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
            <button className="error-close" onClick={() => setError(null)}>✖</button>
          </div>
        )}

        {extractProgress && (
          <div className="extract-progress">
            <div className="spinner"></div>
            <span>{extractProgress}</span>
          </div>
        )}

        {loading && <div className="loading-overlay"><div className="spinner"></div></div>}

        <div className="content-panels">
          {/* File List */}
          <div className="file-list-wrapper" style={{ width: fileListWidth, minWidth: 220, maxWidth: 600 }}>
            <FileList
              files={filteredFiles}
              totalFiles={files.length}
              selectedFile={selectedFile}
              selectedFiles={selectedFiles}
              archiveVersion=""
              filterType={filterType}
              viewMode={viewMode}
              onFilterChange={setFilterType}
              onViewModeChange={setViewMode}
              onSelectFile={handleSelectFile}
              onExtractAll={handleExtractAll}
              onExtractSelected={handleExtractSelected}
              hasArchive={!!selectedArchive}
              extracting={extracting}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* Resize Handle */}
          <div className="resize-handle" onMouseDown={handleResizeStart}>
            <div className="resize-handle-line"></div>
          </div>

          {/* Right Panel: Preview + Queue */}
          <div className="right-panel">
            {/* Preview */}
            {/* Preview */}
            <VideoPreview
              filePath={previewPath}
              fileType={selectedFile?.type || 'other'}
              fileName={selectedFile?.name || null}
              isLoading={previewLoading}
              autoPlayNext={autoPlayNext}
              onToggleAutoPlay={() => setAutoPlayNext(!autoPlayNext)}
              onNext={handleNextFile}
              onPrev={handlePrevFile}
              onExtract={handleExtractSelected}
              navIndex={currentNavIndex}
              navTotal={totalNavItems}
              onAddToQueue={handleAddToQueue}
              hasSelection={selectedFiles.length > 0 || !!selectedFile}
              onToggleQueue={() => setShowQueue(!showQueue)}
              showQueue={showQueue}
              queueLength={playlist.length}
              onEnded={handleVideoEnded}
              triggerReplay={triggerReplay}
            />

            {/* Play Queue (collapsible) */}
            {showQueue && (
              <PlayQueue
                queue={playlist}
                currentIndex={playIndex}
                onReorder={handleReorderQueue}
                onPlay={handlePlayQueueItem}
                onRemove={handleRemoveFromQueue}
                onClear={handleClearQueue}
                onPlayAll={handlePlayAll}
                onExtractQueue={handleExtractQueue}
                extracting={extracting}
                onOpenEditor={handleOpenEditor}
                onUpdateQueueItem={handleUpdateQueueItem}
              />
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
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
      {showGuide && <UserGuide onClose={() => setShowGuide(false)} />}
    </div>
  )
}

export default App
