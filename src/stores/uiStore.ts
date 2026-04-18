import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export type ViewMode = 'grid' | 'list';
export type SortBy = 'name' | 'size' | 'date';
export type SortOrder = 'asc' | 'desc';

interface UIState {
  // View state
  viewMode: ViewMode;
  sortBy: SortBy;
  sortOrder: SortOrder;
  searchQuery: string;
  sidebarCollapsed: boolean;
  showUserGuide: boolean;

  // Modals/Overlays
  activeModal: string | null;
  modalData: unknown;

  // Notifications
  toasts: Toast[];

  // Actions
  setViewMode: (mode: ViewMode) => void;
  setSortBy: (sort: SortBy) => void;
  setSortOrder: (order: SortOrder) => void;
  setSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  toggleUserGuide: () => void;

  // Modal actions
  openModal: (modal: string, data?: unknown) => void;
  closeModal: () => void;

  // Toast actions
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      // Initial state
      viewMode: 'list',
      sortBy: 'name',
      sortOrder: 'asc',
      searchQuery: '',
      sidebarCollapsed: false,
      showUserGuide: false,
      activeModal: null,
      modalData: null,
      toasts: [],

      // Actions
      setViewMode: (mode) => set({ viewMode: mode }, false, 'setViewMode'),
      setSortBy: (sort) => set({ sortBy: sort }, false, 'setSortBy'),
      setSortOrder: (order) => set({ sortOrder: order }, false, 'setSortOrder'),
      setSearchQuery: (query) => set({ searchQuery: query }, false, 'setSearchQuery'),
      toggleSidebar: () =>
        set(
          (state) => ({ sidebarCollapsed: !state.sidebarCollapsed }),
          false,
          'toggleSidebar'
        ),
      toggleUserGuide: () =>
        set(
          (state) => ({ showUserGuide: !state.showUserGuide }),
          false,
          'toggleUserGuide'
        ),

      // Modal actions
      openModal: (modal, data) =>
        set({ activeModal: modal, modalData: data }, false, 'openModal'),
      closeModal: () =>
        set({ activeModal: null, modalData: null }, false, 'closeModal'),

      // Toast actions
      addToast: (toast) =>
        set(
          (state) => ({
            toasts: [
              ...state.toasts,
              { ...toast, id: `${Date.now()}-${Math.random()}` },
            ],
          }),
          false,
          'addToast'
        ),
      removeToast: (id) =>
        set(
          (state) => ({
            toasts: state.toasts.filter((t) => t.id !== id),
          }),
          false,
          'removeToast'
        ),
      clearToasts: () => set({ toasts: [] }, false, 'clearToasts'),
    }),
    { name: 'UIStore' }
  )
);
