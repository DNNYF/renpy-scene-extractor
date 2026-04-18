import { useCallback } from 'react';
import { useArchiveStore, type ArchiveInfo, type ArchiveFile } from '../stores';

interface UseArchiveReturn {
  // State
  archives: ArchiveInfo[];
  selectedArchive: ArchiveInfo | null;
  selectedFiles: Set<string>;
  isLoading: boolean;
  error: string | null;
  setError: (error: string | null) => void;

  // Actions
  scanFolder: (folderPath: string) => Promise<void>;
  scanArchive: (archivePath: string) => Promise<void>;
  selectArchive: (archive: ArchiveInfo | null) => void;
  selectFile: (filePath: string, isMultiSelect?: boolean, isRangeSelect?: boolean) => void;
  clearSelection: () => void;
  extractFiles: (filePaths: string[], outputFolder: string) => Promise<void>;
  extractAll: (outputFolder: string) => Promise<void>;
}

export function useArchive(): UseArchiveReturn {
  const {
    archives,
    selectedArchive,
    selectedFiles,
    isLoading,
    error,
    setArchives,
    selectArchive: storeSelectArchive,
    selectFile: storeSelectFile,
    clearSelection,
    setLoading,
    setError,
  } = useArchiveStore();

  const scanFolder = useCallback(
    async (folderPath: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await window.api.scanFolder(folderPath);
        if (result.success && result.archives) {
          const newArchives: ArchiveInfo[] = result.archives.map((archive) => ({
            path: archive.path,
            name: archive.name,
            size: archive.size,
            relative: archive.relative,
            key: (archive as { key?: number }).key || 0,
            files: [],
          }));
          setArchives(newArchives);
        } else {
          setError(result.error || 'Failed to scan folder');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [setArchives, setLoading, setError]
  );

  const scanArchive = useCallback(
    async (archivePath: string) => {
      setLoading(true);
      setError(null);

      try {
        const result = await window.api.listArchive(archivePath);
        if (result.success && result.files) {
          const existingArchive = archives.find((archive) => archive.path === archivePath);
          const archive: ArchiveInfo = {
            path: archivePath,
            name: existingArchive?.name || archivePath.split(/[\\/]/).pop() || archivePath,
            size: existingArchive?.size || 0,
            relative: existingArchive?.relative || '',
            key: (result as { key?: number }).key || 0,
            files: (result.files as ArchiveFile[]).map((file) => ({
              name: file.name,
              path: file.name,
              size: file.size || 0,
              type: file.type || 'other',
              parts: file.parts || 0,
              offset: file.offset || 0,
              length: file.length || 0,
            })),
          };

          setArchives(
            existingArchive
              ? archives.map((entry) => (entry.path === archivePath ? archive : entry))
              : [...archives, archive]
          );
          storeSelectArchive(archive);
        } else {
          setError(result.error || 'Failed to scan archive');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    [archives, setArchives, storeSelectArchive, setLoading, setError]
  );

  const selectFile = useCallback(
    (filePath: string, isMultiSelect = false, isRangeSelect = false) => {
      storeSelectFile(filePath, isMultiSelect, isRangeSelect);
    },
    [storeSelectFile]
  );

  const extractFiles = useCallback(
    async (filePaths: string[], outputFolder: string) => {
      setLoading(true);
      setError(null);

      try {
        for (const filePath of filePaths) {
          await window.api.extractFile(filePath, outputFolder);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Extraction failed');
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setError]
  );

  const extractAll = useCallback(
    async (outputFolder: string) => {
      if (!selectedArchive) return;

      setLoading(true);
      setError(null);

      try {
        await window.api.extractAll(selectedArchive.path, outputFolder);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Extraction failed');
      } finally {
        setLoading(false);
      }
    },
    [selectedArchive, setLoading, setError]
  );

  return {
    archives,
    selectedArchive,
    selectedFiles,
    isLoading,
    error,
    setError,
    scanFolder,
    scanArchive,
    selectArchive: storeSelectArchive,
    selectFile,
    clearSelection,
    extractFiles,
    extractAll,
  };
}
