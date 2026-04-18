import { useCallback, useEffect, useRef, useState } from 'react';

interface TimelineClip {
  id: string;
  start: number;
  end: number;
  track: number;
}

interface UseTimelineReturn {
  // State
  playhead: number;
  isPlaying: boolean;
  zoom: number;
  duration: number;
  clips: TimelineClip[];

  // Actions
  setPlayhead: (time: number) => void;
  startPlayback: () => void;
  stopPlayback: () => void;
  togglePlayback: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setDuration: (duration: number) => void;
  seekTo: (time: number) => void;
  seekForward: (seconds?: number) => void;
  seekBackward: (seconds?: number) => void;
  getActiveClip: (track?: number) => TimelineClip | null;
  splitClipAtPlayhead: () => void;
  addClip: (clip: Omit<TimelineClip, 'id'>) => void;
  removeClip: (id: string) => void;
  updateClip: (id: string, updates: Partial<TimelineClip>) => void;
}

export function useTimeline(initialDuration = 100): UseTimelineReturn {
  const [playhead, setPlayheadState] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoomState] = useState(1);
  const [duration, setDuration] = useState(initialDuration);
  const [clips, setClips] = useState<TimelineClip[]>([]);

  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  // Playback animation loop
  useEffect(() => {
    if (!isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }

      const deltaTime = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      setPlayheadState((current) => {
        const newTime = current + deltaTime;
        if (newTime >= duration) {
          // Loop or stop at end
          return 0;
        }
        return newTime;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, duration]);

  const setPlayhead = useCallback((time: number) => {
    setPlayheadState(Math.max(0, Math.min(duration, time)));
  }, [duration]);

  const startPlayback = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    lastTimeRef.current = 0;
  }, []);

  const togglePlayback = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const setZoom = useCallback((newZoom: number) => {
    setZoomState(Math.max(0.1, Math.min(10, newZoom)));
  }, []);

  const zoomIn = useCallback(() => {
    setZoomState((prev) => Math.min(10, prev * 1.2));
  }, []);

  const zoomOut = useCallback(() => {
    setZoomState((prev) => Math.max(0.1, prev / 1.2));
  }, []);

  const seekTo = useCallback(
    (time: number) => {
      setPlayheadState(Math.max(0, Math.min(duration, time)));
    },
    [duration]
  );

  const seekForward = useCallback(
    (seconds = 5) => {
      setPlayheadState((prev) => Math.min(duration, prev + seconds));
    },
    [duration]
  );

  const seekBackward = useCallback(
    (seconds = 5) => {
      setPlayheadState((prev) => Math.max(0, prev - seconds));
    },
    []
  );

  const getActiveClip = useCallback(
    (track = 0) => {
      return (
        clips.find(
          (clip) =>
            clip.track === track && playhead >= clip.start && playhead <= clip.end
        ) || null
      );
    },
    [clips, playhead]
  );

  const splitClipAtPlayhead = useCallback(() => {
    const activeClip = getActiveClip();
    if (!activeClip || playhead <= activeClip.start || playhead >= activeClip.end) {
      return;
    }

    setClips((prev) => {
      const newClips = prev.filter((c) => c.id !== activeClip.id);
      return [
        ...newClips,
        {
          ...activeClip,
          id: `${activeClip.id}-1`,
          end: playhead,
        },
        {
          ...activeClip,
          id: `${activeClip.id}-2`,
          start: playhead,
        },
      ];
    });
  }, [clips, playhead, getActiveClip]);

  const addClip = useCallback((clip: Omit<TimelineClip, 'id'>) => {
    const newClip: TimelineClip = {
      ...clip,
      id: `clip-${Date.now()}-${Math.random()}`,
    };
    setClips((prev) => [...prev, newClip]);
  }, []);

  const removeClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateClip = useCallback((id: string, updates: Partial<TimelineClip>) => {
    setClips((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }, []);

  return {
    playhead,
    isPlaying,
    zoom,
    duration,
    clips,
    setPlayhead,
    startPlayback,
    stopPlayback,
    togglePlayback,
    setZoom,
    zoomIn,
    zoomOut,
    setDuration,
    seekTo,
    seekForward,
    seekBackward,
    getActiveClip,
    splitClipAtPlayhead,
    addClip,
    removeClip,
    updateClip,
  };
}
