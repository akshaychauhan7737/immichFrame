
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { ImmichAsset, MediaAsset } from '@/lib/types';
import type { useImmich } from './useImmich';
import { useToast } from './use-toast';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
const LOCAL_STORAGE_DATE_KEY = 'immich-view-taken-before';

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


  // --- Core Slideshow Logic ---
  const preloadNextAsset = useCallback(async (currentPlaylist: ImmichAsset[]) => {
    const mutablePlaylist = [...currentPlaylist];
    let nextAssetToLoad = mutablePlaylist.shift();

    if (!nextAssetToLoad) {
      setNextMedia(null);
      return mutablePlaylist;
    }
  
    const newMedia = await getAssetWithRetry(nextAssetToLoad);
    
    if (newMedia) {
      setNextMedia(newMedia);
    } else {
      // If loading fails, recursively try the next one
      return await preloadNextAsset(mutablePlaylist);
    }
    return mutablePlaylist;
  }, [getAssetWithRetry]);

  const advanceToNextAsset = useCallback(async () => {
    if (!nextMedia) {
      console.log("Next media not ready, triggering fetch.");
      if (playlist.length === 0) {
        setIsFetching(true);
      }
      return;
    }

    const oldMedia = currentMedia;
    
    flushSync(async () => {
      setIsFading(true);
      await delay(500); // Wait for fade-out

      // Promote next to current, creating a new object to ensure re-render
      setCurrentMedia({ ...nextMedia });

      // Preload the next asset and update the playlist
      const updatedPlaylist = await preloadNextAsset(playlist);
      setPlaylist(updatedPlaylist);

      // Clean up old blob URL
      if (oldMedia) {
        revokeAssetUrls(oldMedia);
      }
      
      setIsFading(false);
    });
  }, [nextMedia, playlist, currentMedia, preloadNextAsset, revokeAssetUrls]);
  
  // --- Effects ---

  // Trigger initial fetch on mount
  useEffect(() => {
    if (!initialError) {
      setIsFetching(true);
    } else {
      setIsLoading(false);
    }
  }, [initialError]);

  // Main logic to fetch assets when isFetching is true
  useEffect(() => {
    if (!isFetching) return;

    const performFetch = async () => {
      setError(null);
      const takenBefore = localStorage.getItem(LOCAL_STORAGE_DATE_KEY);

      const newAssets = await fetchAssets(takenBefore);

      if (newAssets === null) {
        setError(`Failed to connect to Immich server.`);
        setIsFetching(false);
        await delay(5000);
        setIsFetching(true); // Retry after delay
        return;
      }
      
      if (newAssets.length === 0) {
        if (takenBefore) {
          console.log("No more assets found, starting from the beginning.");
          localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
          // Immediately re-fetch from the beginning
          performFetch();
        } else {
          setError(`No photos found matching your filters.`);
          setIsLoading(false);
          setIsFetching(false);
        }
        return;
      }
      
      setPlaylist(current => [...current, ...newAssets]);
      setIsFetching(false);
    };

    performFetch();
  }, [isFetching, fetchAssets]);

  // Initial slideshow start when playlist is populated
  useEffect(() => {
    const startSlideshow = async () => {
      if (playlist.length === 0 || !isLoading) return;

      let mutablePlaylist = [...playlist];
      
      const firstAssetToLoad = mutablePlaylist.shift();
      if (!firstAssetToLoad) {
        setError("Failed to load any initial assets.");
        setIsLoading(false);
        return;
      }

      const firstMedia = await getAssetWithRetry(firstAssetToLoad);
      if (!firstMedia) {
        setError("Failed to load the first asset. Cannot start slideshow.");
        setIsLoading(false);
        if (mutablePlaylist.length === 0 && !isFetching) {
          setIsFetching(true);
        }
        return;
      }
      
      setCurrentMedia(firstMedia);
      
      // Preload the next one immediately
      const updatedPlaylist = await preloadNextAsset(mutablePlaylist);
      setPlaylist(updatedPlaylist);

      setIsLoading(false);
    };

    if (playlist.length > 0 && isLoading && !isFetching) {
      startSlideshow();
    }
  }, [isLoading, isFetching, playlist, getAssetWithRetry, preloadNextAsset]);


  // Save current asset's date to local storage whenever it changes.
  useEffect(() => {
    if (currentMedia?.asset?.fileCreatedAt) {
      localStorage.setItem(LOCAL_STORAGE_DATE_KEY, currentMedia.asset.fileCreatedAt);
    }
  }, [currentMedia]);
  
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

  const handleTimelineChange = useCallback((date: Date | null) => {
    if (date) {
        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, date.toISOString());
    } else {
        localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
    }
    setPlaylist([]);
    setCurrentMedia(null);
    setNextMedia(null);
    setIsLoading(true);
    setIsFetching(true);
    toast({
        title: date ? "Timeline Set" : "Timeline Reset",
        description: date ? `Searching for photos before ${date.toLocaleDateString()}.` : "Restarting from the most recent photos.",
    });
  }, [toast]);

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
