
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { ImmichAsset, MediaAsset } from '@/lib/types';
import type { useImmich } from './useImmich';
import { useToast } from './use-toast';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
export const LOCAL_STORAGE_DATE_KEY = 'immich-view-taken-before';


// --- Helper Functions ---
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

type ImmichHook = ReturnType<typeof useImmich>;

export function useSlideshow(immich: ImmichHook) {
  const { toast } = useToast();
  const { fetchAssets, getAssetWithRetry, revokeAssetUrls, configError } = immich;

  // --- State Management ---
  const [playlist, setPlaylist] = useState<ImmichAsset[]>([]);
  const [currentMedia, setCurrentMedia] = useState<MediaAsset | null>(null);
  const [nextMedia, setNextMedia] = useState<MediaAsset | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [progress, setProgress] = useState(0);

  const initialError = useMemo(() => {
    if (configError) {
      return `Configuration Error: ${configError}. Please check your environment variables.`;
    }
    return null;
  }, [configError]);
  
  const [error, setError] = useState<string | null>(initialError);

  // Use a ref to get the current video duration without causing re-renders
  const videoDurationRef = useRef<number>(0);


  const setCurrentMediaAndMarkVisited = useCallback((media: MediaAsset | null) => {
    setCurrentMedia(media);
    if (media?.asset) {
      const takenDate = media.asset.fileCreatedAt;
      if (takenDate) {
        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, takenDate);
      }
    }
  }, []);

  // --- Core Slideshow Logic ---
  const preloadNextAsset = useCallback(async (currentPlaylist: ImmichAsset[]) => {
    let mutablePlaylist = [...currentPlaylist];
    let nextAssetToLoad = mutablePlaylist.shift();

    // If playlist is empty, fetch more assets synchronously.
    if (!nextAssetToLoad) {
      setIsFetching(true);
      setError(null);
      const newAssets = await fetchAssets();
      setIsFetching(false);

      if (newAssets && newAssets.length > 0) {
        mutablePlaylist = newAssets;
        nextAssetToLoad = mutablePlaylist.shift();
      } else {
        // If fetch fails or returns no assets, stop preloading.
        setNextMedia(null);
        if (newAssets === null) setError(`Failed to connect to Immich server.`);
        // If newAssets is empty array, it means end of timeline was reached. UI will show message.
        return []; 
      }
    }
  
    if (!nextAssetToLoad) {
      setNextMedia(null);
      return [];
    }
    
    const newMedia = await getAssetWithRetry(nextAssetToLoad);
    
    if (newMedia) {
      setNextMedia(newMedia);
      return mutablePlaylist; // Return the rest of the playlist
    } else {
      // If loading a specific asset fails, recursively try the next one.
      return await preloadNextAsset(mutablePlaylist);
    }
  }, [getAssetWithRetry, fetchAssets, setError, setIsFetching]);


  const advanceToNextAsset = useCallback(async () => {
    if (isFading) return; // Prevent multiple concurrent advances

    const oldMedia = currentMedia;
    
    flushSync(async () => {
      // Only apply fade transition for images
      if (nextMedia?.type !== 'VIDEO') {
        setIsFading(true);
        await delay(500); // Wait for fade-out
      }

      if (nextMedia) {
        // Promote next to current
        setCurrentMediaAndMarkVisited(nextMedia);

        // Preload the next asset and update the playlist
        const updatedPlaylist = await preloadNextAsset(playlist);
        setPlaylist(updatedPlaylist);

      } else {
        // No next media was available, might be end of playlist. Trigger a preload.
        const updatedPlaylist = await preloadNextAsset(playlist);
        setPlaylist(updatedPlaylist);
        // If preloadNextAsset was successful, nextMedia will be updated. If not, slideshow will pause.
      }
      
      // Clean up old blob URL
      if (oldMedia) {
        revokeAssetUrls(oldMedia);
      }
      
      if (nextMedia?.type !== 'VIDEO') {
        setIsFading(false);
      }
    });
  }, [nextMedia, playlist, currentMedia, preloadNextAsset, revokeAssetUrls, isFading, setCurrentMediaAndMarkVisited]);
  
  // --- Effects ---

  // Initial fetch and slideshow start on mount
  useEffect(() => {
    if (initialError) {
      setError(initialError);
      setIsLoading(false);
      return;
    }

    const startSlideshow = async () => {
      setIsFetching(true);
      const initialAssets = await fetchAssets();
      setIsFetching(false);

      if (!initialAssets || initialAssets.length === 0) {
        setError("No photos found. Check your Immich settings or server connection.");
        setIsLoading(false);
        return;
      }
      
      let mutablePlaylist = [...initialAssets];
      const firstAssetToLoad = mutablePlaylist.shift();

      if (!firstAssetToLoad) {
        setError("Failed to get first asset from the list.");
        setIsLoading(false);
        return;
      }

      const firstMedia = await getAssetWithRetry(firstAssetToLoad);
      if (!firstMedia) {
        setError("Failed to load the first asset. Cannot start slideshow.");
        setIsLoading(false);
        return;
      }
      
      setCurrentMediaAndMarkVisited(firstMedia);
      
      // Preload the next one immediately
      const updatedPlaylist = await preloadNextAsset(mutablePlaylist);
      setPlaylist(updatedPlaylist);
      setIsLoading(false);
    };

    startSlideshow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialError]);

  
  // Asset rotation timer for images
  useEffect(() => {
    if (isLoading || !currentMedia || currentMedia.type === 'VIDEO') return;

    const timer = setTimeout(() => {
      advanceToNextAsset();
    }, DURATION);

    return () => clearTimeout(timer);
  }, [isLoading, currentMedia, advanceToNextAsset]);
  
  
  // Force-play videos when they become the current media
  useEffect(() => {
    if (currentMedia?.type === 'VIDEO') {
        const videoElement = document.querySelector('video'); // A bit fragile, but works for a single video player
        if (videoElement) {
            videoElement.play().catch(error => {
                console.error("Video play failed:", error);
                advanceToNextAsset(); 
            });
        }
    }
  }, [currentMedia, advanceToNextAsset]);


  // Progress bar animation
  useEffect(() => {
    if (isLoading || error || !currentMedia) {
      setProgress(0);
      return;
    }
    
    // Reset progress on media change
    setProgress(0);
    
    let displayDuration = DURATION;
    if (currentMedia.type === 'VIDEO' && videoDurationRef.current > 0) {
        displayDuration = videoDurationRef.current * 1000;
    }

    if (displayDuration <= 0) return;

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + (100 / (displayDuration / 100)), 100));
    }, 100);

    return () => clearInterval(interval);
  }, [currentMedia, isLoading, error]);
  
  // --- UI Event Handlers ---

  const handleTimelineChange = useCallback(async (date: Date | null) => {
    if (date) {
        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, date.toISOString());
    } else {
        localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
    }
    
    // Reset state and re-initialize
    setPlaylist([]);
    setCurrentMediaAndMarkVisited(null);
    setNextMedia(null);
    setIsLoading(true);

    const newAssets = await fetchAssets();
    if (newAssets && newAssets.length > 0) {
        let mutablePlaylist = [...newAssets];
        const firstAsset = mutablePlaylist.shift();
        if (firstAsset) {
            const firstMedia = await getAssetWithRetry(firstAsset);
            setCurrentMediaAndMarkVisited(firstMedia);
            const restOfPlaylist = await preloadNextAsset(mutablePlaylist);
            setPlaylist(restOfPlaylist);
        }
    } else {
        setError("No photos found for the selected date.");
    }

    setIsLoading(false);

    toast({
        title: date ? "Timeline Set" : "Timeline Reset",
        description: date ? `Searching for photos before ${date.toLocaleDateString()}.` : "Restarting from the most recent photos.",
    });
  }, [fetchAssets, getAssetWithRetry, preloadNextAsset, toast, setCurrentMediaAndMarkVisited]);

  return {
    currentMedia,
    nextMedia,
    isLoading,
    isFetching,
    isFading,
    progress,
    error,
    handleTimelineChange,
    advanceToNextAsset,
  };
}
