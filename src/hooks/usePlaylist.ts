import { useCallback } from 'react';
import { usePlaylistStore, useArchiveStore, type ArchiveFile } from '../stores';

interface UsePlaylistReturn {
  // State
  queue: import('../stores').QueueItem[];
  currentIndex: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  currentItem: import('../stores').QueueItem | null;
  nextItem: import('../stores').QueueItem | null;

  // Actions
  addToQueue: (files: ArchiveFile[]) => void;
  addSelectedToQueue: () => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  moveItem: (fromIndex: number, toIndex: number) => void;
  updateQueueItem: (index: number, updates: Partial<import('../stores').QueueItem>) => void;
  playItem: (index: number) => void;
  playNext: () => void;
  playPrevious: () => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  handleVideoEnded: () => void;
}

export function usePlaylist(): UsePlaylistReturn {
  const {
    queue,
    currentIndex,
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    addToQueue: storeAddToQueue,
    removeFromQueue,
    clearQueue,
    moveItem,
    setCurrentIndex,
    next,
    previous,
    setPlaying,
    togglePlay,
    setVolume: storeSetVolume,
    setMuted,
    setPlaybackRate,
    updateQueueItem,
    getCurrentItem,
    getNextItem,
  } = usePlaylistStore();

  const { getSelectedFilesList } = useArchiveStore();

  const currentItem = getCurrentItem();
  const nextItem = getNextItem();

  const addToQueue = useCallback(
    (files: ArchiveFile[]) => {
      storeAddToQueue(files);
    },
    [storeAddToQueue]
  );

  const addSelectedToQueue = useCallback(() => {
    const files = getSelectedFilesList();
    if (files.length > 0) {
      storeAddToQueue(files);
    }
  }, [getSelectedFilesList, storeAddToQueue]);

  const playItem = useCallback(
    (index: number) => {
      setCurrentIndex(index);
      setPlaying(true);
    },
    [setCurrentIndex, setPlaying]
  );

  const playNext = useCallback(() => {
    next();
  }, [next]);

  const playPrevious = useCallback(() => {
    previous();
  }, [previous]);

  const setVolume = useCallback(
    (vol: number) => {
      storeSetVolume(vol);
    },
    [storeSetVolume]
  );

  const toggleMute = useCallback(() => {
    setMuted(!isMuted);
  }, [setMuted, isMuted]);

  const handleVideoEnded = useCallback(() => {
    const item = getCurrentItem();
    if (item) {
      next();
    } else {
      setPlaying(false);
    }
  }, [getCurrentItem, next, setPlaying]);

  return {
    queue,
    currentIndex,
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    currentItem,
    nextItem,
    addToQueue,
    addSelectedToQueue,
    removeFromQueue,
    clearQueue,
    moveItem,
    updateQueueItem,
    playItem,
    playNext,
    playPrevious,
    togglePlay,
    setVolume,
    toggleMute,
    setPlaybackRate,
    handleVideoEnded,
  };
}
