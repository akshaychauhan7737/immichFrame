
"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { ImmichAsset, MediaAsset } from '@/lib/types';
import type { useImmich } from './useImmich';
import { useToast } from './use-toast';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
export const LOCAL_STORAGE_DATE_KEY = 'immich-view-time-bucket';


// --- Helper Functions ---
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

type ImmichHook = ReturnType<typeof useImmich>;

export function useSlideshow(immich: ImmichHook) {
  const { toast } = useToast();
  const { fetchAssets, findInitialAssets, getAssetWithRetry, revokeAssetUrls, configError } = immich;

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

  const videoDurationRef = useRef<number>(0);


  const setCurrentMediaAndMarkVisited = useCallback((media: MediaAsset | null) => {
    setCurrentMedia(media);
    if (media?.asset) {
        // We store the bucket's date string (e.g., "2025-09-01") directly
        const bucketDate = new Date(media.asset.fileCreatedAt);
        const year = bucketDate.getFullYear();
        const month = (bucketDate.getMonth() + 1).toString().padStart(2, '0');
        const day = '01'; // Buckets are always by month
        const bucketIdentifier = `${year}-${month}-${day}`;
        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, bucketIdentifier);
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
        setNextMedia(null);
        if (newAssets === null) setError(`Failed to connect to Immich server.`);
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
      return mutablePlaylist;
    } else {
      return await preloadNextAsset(mutablePlaylist);
    }
  }, [getAssetWithRetry, fetchAssets, setError, setIsFetching]);


  const advanceToNextAsset = useCallback(async () => {
    if (isFading) return;

    const oldMedia = currentMedia;
    
    flushSync(async () => {
      if (nextMedia?.type !== 'VIDEO') {
        setIsFading(true);
        await delay(500);
      }

      if (nextMedia) {
        setCurrentMediaAndMarkVisited(nextMedia);
        const updatedPlaylist = await preloadNextAsset(playlist);
        setPlaylist(updatedPlaylist);

      } else {
        const updatedPlaylist = await preloadNextAsset(playlist);
        setPlaylist(updatedPlaylist);
      }
      
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
      setIsLoading(true);
      setError(null);

      const savedBucket = localStorage.getItem(LOCAL_STORAGE_DATE_KEY);
      let initialResult: { assets: ImmichAsset[], foundDate: Date } | null;

      if (savedBucket) {
        // savedBucket is a string like "2025-09-01", convert to Date
        const assets = await fetchAssets(new Date(savedBucket));
        initialResult = assets ? { assets, foundDate: new Date(savedBucket) } : null;
      } else {
        initialResult = await findInitialAssets();
      }

      if (!initialResult || initialResult.assets.length === 0) {
        setError("No photos found. Check your Immich server or use settings to select a specific timeline.");
        setIsLoading(false);
        return;
      }
      
      let mutablePlaylist = [...initialResult.assets];
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
      
      // Set the date so subsequent fetches continue from here
      localStorage.setItem(LOCAL_STORAGE_DATE_KEY, initialResult.foundDate.toISOString().split('T')[0]);
      setCurrentMediaAndMarkVisited(firstMedia);
      
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
        const videoElement = document.querySelector('video');
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
        // The date comes from a bucket string like "2025-09-01", so it's already what we need.
        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, date.toISOString().split('T')[0]);
    } else {
        localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
    }
    
    setPlaylist([]);
    setCurrentMediaAndMarkVisited(null);
    setNextMedia(null);
    setIsLoading(true);

    const result = date ? { assets: await fetchAssets(date), foundDate: date } : await findInitialAssets();
    
    if (result && result.assets && result.assets.length > 0) {
        let mutablePlaylist = [...result.assets];
        const firstAsset = mutablePlaylist.shift();
        if (firstAsset) {
            const firstMedia = await getAssetWithRetry(firstAsset);
            setCurrentMediaAndMarkVisited(firstMedia);
            const restOfPlaylist = await preloadNextAsset(mutablePlaylist);
            setPlaylist(restOfPlaylist);
        } else {
            setError("No photos found for the selected date.");
        }
    } else {
        setError("No photos found for the selected date.");
    }

    setIsLoading(false);

    toast({
        title: date ? "Timeline Set" : "Timeline Reset",
        description: date ? `Searching for photos from ${date.toLocaleDateString()}.` : "Searching for latest photos.",
    });
  }, [fetchAssets, findInitialAssets, getAssetWithRetry, preloadNextAsset, toast, setCurrentMediaAndMarkVisited]);

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
