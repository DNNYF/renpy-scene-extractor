import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface ArchiveFile {
  name: string;
  path: string;
  size: number;
  type: 'video' | 'image' | 'audio' | 'other';
  parts: number;
  offset: number;
  length: number;
}

export interface ArchiveInfo {
  path: string;
  name: string;
  size: number;
  relative: string;
  key: number;
  files: ArchiveFile[];
}

interface ArchiveState {
  // State
  archives: ArchiveInfo[];
  selectedArchive: ArchiveInfo | null;
  selectedFiles: Set<string>;
  isLoading: boolean;
  error: string | null;

  // Actions
  setArchives: (archives: ArchiveInfo[]) => void;
  addArchive: (archive: ArchiveInfo) => void;
  removeArchive: (path: string) => void;
  selectArchive: (archive: ArchiveInfo | null) => void;
  selectFile: (filePath: string, isMultiSelect?: boolean, isRangeSelect?: boolean) => void;
  clearSelection: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  getSelectedFilesList: () => ArchiveFile[];
}

export const useArchiveStore = create<ArchiveState>()(
  devtools(
    (set, get) => ({
      // Initial state
      archives: [],
      selectedArchive: null,
      selectedFiles: new Set(),
      isLoading: false,
      error: null,

      // Actions
      setArchives: (archives) => set({ archives }, false, 'setArchives'),

      addArchive: (archive) =>
        set(
          (state) => ({ archives: [...state.archives, archive] }),
          false,
          'addArchive'
        ),

      removeArchive: (path) =>
        set(
          (state) => ({
            archives: state.archives.filter((a) => a.path !== path),
            selectedArchive:
              state.selectedArchive?.path === path ? null : state.selectedArchive,
          }),
          false,
          'removeArchive'
        ),

      selectArchive: (archive) =>
        set({ selectedArchive: archive, selectedFiles: new Set() }, false, 'selectArchive'),

      selectFile: (filePath, isMultiSelect = false, isRangeSelect = false) =>
        set((state) => {
          const newSelection = new Set(state.selectedFiles);

          if (isRangeSelect && state.selectedArchive) {
            // Range selection logic
            const files = state.selectedArchive.files;
            const lastSelected = Array.from(state.selectedFiles).pop();
            const lastIndex = files.findIndex((f) => f.path === lastSelected);
            const currentIndex = files.findIndex((f) => f.path === filePath);

            if (lastIndex !== -1 && currentIndex !== -1) {
              const start = Math.min(lastIndex, currentIndex);
              const end = Math.max(lastIndex, currentIndex);
              for (let i = start; i <= end; i++) {
                newSelection.add(files[i].path);
              }
            }
          } else if (isMultiSelect) {
            // Toggle selection
            if (newSelection.has(filePath)) {
              newSelection.delete(filePath);
            } else {
              newSelection.add(filePath);
            }
          } else {
            // Single selection
            newSelection.clear();
            newSelection.add(filePath);
          }

          return { selectedFiles: newSelection };
        }, false, 'selectFile'),

      clearSelection: () => set({ selectedFiles: new Set() }, false, 'clearSelection'),

      setLoading: (loading) => set({ isLoading: loading }, false, 'setLoading'),

      setError: (error) => set({ error }, false, 'setError'),

      getSelectedFilesList: () => {
        const state = get();
        if (!state.selectedArchive) return [];
        return state.selectedArchive.files.filter((f) =>
          state.selectedFiles.has(f.path)
        );
      },
    }),
    { name: 'ArchiveStore' }
  )
);
