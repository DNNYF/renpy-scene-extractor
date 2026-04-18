import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ArchiveFile } from './archiveStore';

export interface QueueItem extends ArchiveFile {
  id: string;
  loopCount: number;
}

interface PlaylistState {
  // State
  queue: QueueItem[];
  currentIndex: number;
  isPlaying: boolean;
  volume: number;
  isMuted: boolean;
  playbackRate: number;

  // Actions
  addToQueue: (files: ArchiveFile[]) => void;
  removeFromQueue: (index: number) => void;
  clearQueue: () => void;
  moveItem: (fromIndex: number, toIndex: number) => void;
  setCurrentIndex: (index: number) => void;
  next: () => void;
  previous: () => void;
  setPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  setPlaybackRate: (rate: number) => void;
  incrementLoopCount: (index: number) => void;
  updateQueueItem: (index: number, updates: Partial<QueueItem>) => void;
  getCurrentItem: () => QueueItem | null;
  getNextItem: () => QueueItem | null;
}

export const usePlaylistStore = create<PlaylistState>()(
  devtools(
    (set, get) => ({
      // Initial state
      queue: [],
      currentIndex: -1,
      isPlaying: false,
      volume: 1,
      isMuted: false,
      playbackRate: 1,

      // Actions
      addToQueue: (files) =>
        set(
          (state) => {
            const newItems: QueueItem[] = files.map((file, i) => ({
              ...file,
              id: `${file.path}-${Date.now()}-${i}`,
              loopCount: 1,
            }));
            return {
              queue: [...state.queue, ...newItems],
              // Auto-select first item if queue was empty
              currentIndex: state.queue.length === 0 ? 0 : state.currentIndex,
            };
          },
          false,
          'addToQueue'
        ),

      removeFromQueue: (index) =>
        set(
          (state) => {
            const newQueue = [...state.queue];
            newQueue.splice(index, 1);

            let newIndex = state.currentIndex;
            if (index < state.currentIndex) {
              newIndex = state.currentIndex - 1;
            } else if (index === state.currentIndex) {
              // Removed current item, stay at same index or go to previous
              newIndex = Math.min(state.currentIndex, newQueue.length - 1);
            }

            return {
              queue: newQueue,
              currentIndex: newIndex,
              isPlaying: newIndex >= 0 ? state.isPlaying : false,
            };
          },
          false,
          'removeFromQueue'
        ),

      clearQueue: () =>
        set(
          { queue: [], currentIndex: -1, isPlaying: false },
          false,
          'clearQueue'
        ),

      moveItem: (fromIndex, toIndex) =>
        set(
          (state) => {
            const newQueue = [...state.queue];
            const [movedItem] = newQueue.splice(fromIndex, 1);
            newQueue.splice(toIndex, 0, movedItem);

            // Update current index if affected
            let newIndex = state.currentIndex;
            if (fromIndex === state.currentIndex) {
              newIndex = toIndex;
            } else if (
              fromIndex < state.currentIndex &&
              toIndex >= state.currentIndex
            ) {
              newIndex = state.currentIndex - 1;
            } else if (
              fromIndex > state.currentIndex &&
              toIndex <= state.currentIndex
            ) {
              newIndex = state.currentIndex + 1;
            }

            return { queue: newQueue, currentIndex: newIndex };
          },
          false,
          'moveItem'
        ),

      setCurrentIndex: (index) =>
        set({ currentIndex: index }, false, 'setCurrentIndex'),

      next: () =>
        set((state) => {
          if (state.queue.length === 0) return {};

          const nextIndex = state.currentIndex < 0
            ? 0
            : (state.currentIndex + 1) % state.queue.length;
          return { currentIndex: nextIndex };
        }, false, 'next'),

      previous: () =>
        set((state) => {
          if (state.queue.length === 0) return {};
          if (state.currentIndex < 0) {
            return { currentIndex: state.queue.length - 1 };
          }

          const prevIndex =
            state.currentIndex <= 0
              ? state.queue.length - 1
              : state.currentIndex - 1;
          return { currentIndex: prevIndex };
        }, false, 'previous'),

      setPlaying: (playing) => set({ isPlaying: playing }, false, 'setPlaying'),

      togglePlay: () =>
        set((state) => ({ isPlaying: !state.isPlaying }), false, 'togglePlay'),

      setVolume: (volume) =>
        set({ volume: Math.max(0, Math.min(1, volume)) }, false, 'setVolume'),

      setMuted: (muted) => set({ isMuted: muted }, false, 'setMuted'),

      setPlaybackRate: (rate) =>
        set({ playbackRate: rate }, false, 'setPlaybackRate'),

      incrementLoopCount: (index) =>
        set(
          (state) => {
            const newQueue = [...state.queue];
            if (newQueue[index]) {
              newQueue[index] = {
                ...newQueue[index],
                loopCount: newQueue[index].loopCount + 1,
              };
            }
            return { queue: newQueue };
          },
          false,
          'incrementLoopCount'
        ),

      updateQueueItem: (index, updates) =>
        set(
          (state) => {
            const newQueue = [...state.queue];
            if (newQueue[index]) {
              newQueue[index] = {
                ...newQueue[index],
                ...updates,
              };
            }
            return { queue: newQueue };
          },
          false,
          'updateQueueItem'
        ),

      getCurrentItem: () => {
        const state = get();
        return state.queue[state.currentIndex] || null;
      },

      getNextItem: () => {
        const state = get();
        if (state.queue.length === 0) return null;
        const nextIndex = (state.currentIndex + 1) % state.queue.length;
        return state.queue[nextIndex] || null;
      },
    }),
    { name: 'PlaylistStore' }
  )
);
