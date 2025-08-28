
"use client";

import type { ImmichAlbum, ImmichAsset } from '@/lib/types';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, MapPin, Calendar, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
const RETRY_DELAY = 5000; // 5 seconds
const DISPLAY_MODE = process.env.NEXT_PUBLIC_DISPLAY_MODE || 'landscape'; // 'portrait', 'landscape', or 'all'

// We use a local proxy to avoid CORS issues.
const PROXY_URL = '/api/immich';
const SERVER_URL_CONFIGURED = !!process.env.NEXT_PUBLIC_IMMICH_SERVER_URL;
const API_KEY = process.env.NEXT_PUBLIC_IMMICH_API_KEY;
const IS_FAVORITE_ONLY = process.env.NEXT_PUBLIC_IMMICH_IS_FAVORITE_ONLY === 'true';


// --- Helper Functions ---
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));


export default function Home() {
  const { toast } = useToast();
  
  // --- State Management ---
  const [currentAssets, setCurrentAssets] = useState<ImmichAsset[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<ImmichAlbum | null>(null);
  const [assetIndex, setAssetIndex] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [progress, setProgress] = useState(0);

  const [imageA, setImageA] = useState<{ url: string, id: string }>({ url: '', id: 'initialA' });
  const [imageB, setImageB] = useState<{ url: string, id: string }>({ url: '', id: 'initialB' });
  const [isAVisible, setIsAVisible] = useState(true);
  const [nextImageLoaded, setNextImageLoaded] = useState(false);

  // Refs to hold the full list of albums and our position in it
  const albumPlaylist = useRef<ImmichAlbum[]>([]);
  const albumIndex = useRef(0);

  const areConfigsMissing = useMemo(() => !SERVER_URL_CONFIGURED || !API_KEY, []);
  
  const currentAsset = useMemo(() => currentAssets[assetIndex], [currentAssets, assetIndex]);

  // --- Image Fetching Logic ---
  const getImageUrl = useCallback(async (assetId: string): Promise<string | null> => {
    if (areConfigsMissing) return null;
    try {
      const res = await fetch(`${PROXY_URL}/assets/${assetId}/thumbnail?size=preview`, {
        method: 'GET',
        headers: { 'x-api-key': API_KEY as string },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.statusText}`);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e: any)      {
        console.error(`Error fetching image ${assetId}:`, e);
        toast({
            variant: "destructive",
            title: "Image Fetch Error",
            description: `Could not load image ${assetId}.`,
        });
        return null;
    }
  }, [areConfigsMissing, toast]);
  
  const getImageWithRetry = useCallback(async (assetId: string, retries = 1): Promise<string | null> => {
      let url = await getImageUrl(assetId);
      if (url) {
          return url;
      }
      
      if (retries > 0) {
          toast({
              title: "Retrying Image Load",
              description: `Will retry loading image in ${RETRY_DELAY / 1000} seconds.`,
          });
          await delay(RETRY_DELAY);
          return await getImageWithRetry(assetId, retries - 1);
      }
      
      toast({
          variant: "destructive",
          title: "Image Load Failed",
          description: `Skipping image ${assetId} after multiple attempts.`,
      });
      return null;

  }, [getImageUrl, toast]);


  const loadNextAsset = useCallback(async () => {
    let nextAssetIndex = (assetIndex + 1);
    let nextAlbumIndex = albumIndex.current;
    
    // If we've reached the end of the current album's assets
    if (nextAssetIndex >= currentAssets.length) {
      nextAssetIndex = 0;
      nextAlbumIndex = (albumIndex.current + 1);
      if (nextAlbumIndex >= albumPlaylist.current.length) {
          nextAlbumIndex = 0; // Loop back to the start of the playlist
      }
      // This will trigger the useEffect to load a new album
      albumIndex.current = nextAlbumIndex; 
      // Setting current assets to empty will show loader and trigger album load effect
      setCurrentAssets([]); 
      return;
    }

    const nextAsset = currentAssets[nextAssetIndex];
    if (!nextAsset) return;

    const newUrl = await getImageWithRetry(nextAsset.id);

    if (newUrl) {
      if (isAVisible) {
        setImageB({ url: newUrl, id: nextAsset.id });
      } else {
        setImageA({ url: newUrl, id: nextAsset.id });
      }
      setAssetIndex(nextAssetIndex);
    } else {
      // If we failed to get the image, skip to the next one immediately
      setAssetIndex(i => (i + 1)); // This will trigger loadNextAsset again via useEffect
    }
  }, [assetIndex, currentAssets, getImageWithRetry, isAVisible]);


  // --- Effects ---

  // Main logic to find and load a suitable album with assets
  useEffect(() => {
    if (areConfigsMissing) {
      setError("Server URL or API Key is missing. Please check your environment variables.");
      setIsLoading(false);
      return;
    }

    const findAndLoadAlbum = async () => {
      setIsLoading(true);
      setError(null);
    
      // 1. Fetch all albums if the playlist is empty
      if (albumPlaylist.current.length === 0) {
        try {
          const albumsResponse = await fetch(`${PROXY_URL}/albums`, {
            headers: { 'x-api-key': API_KEY as string, 'Accept': 'application/json' },
          });
          if (!albumsResponse.ok) throw new Error('Failed to fetch album list.');
          const allAlbums: ImmichAlbum[] = await albumsResponse.json();
          
          if (allAlbums.length === 0) {
            setError("No albums found on the Immich server.");
            setIsLoading(false);
            return;
          }
          albumPlaylist.current = shuffleArray(allAlbums);
        } catch (e: any) {
          setError(`Failed to connect to Immich server: ${e.message}`);
          setIsLoading(false);
          return;
        }
      }

      // 2. Iterate through the album playlist to find one with matching photos
      let foundSuitableAlbum = false;
      const initialAlbumIndex = albumIndex.current;
      
      while (!foundSuitableAlbum) {
        const targetAlbum = albumPlaylist.current[albumIndex.current];

        try {
          const albumDetailsResponse = await fetch(`${PROXY_URL}/albums/${targetAlbum.id}`, {
            headers: { 'x-api-key': API_KEY as string, 'Accept': 'application/json' },
          });
          if (!albumDetailsResponse.ok) throw new Error(`Could not fetch details for album ${targetAlbum.albumName}.`);
          
          const albumWithAssets: ImmichAlbum = await albumDetailsResponse.json();
          let fetchedAssets = albumWithAssets.assets;

          if (IS_FAVORITE_ONLY) {
            fetchedAssets = fetchedAssets.filter(asset => asset.isFavorite);
          }

          if (DISPLAY_MODE === 'portrait' || DISPLAY_MODE === 'landscape') {
            fetchedAssets = fetchedAssets.filter(asset => {
              const height = asset.exifInfo?.exifImageHeight ?? 0;
              const width = asset.exifInfo?.exifImageWidth ?? 0;
              if (height === 0 || width === 0) return false;
              return DISPLAY_MODE === 'portrait' ? height > width : width > height;
            });
          }

          if (fetchedAssets.length > 0) {
            const shuffledAssets = shuffleArray(fetchedAssets);
            setCurrentAlbum(albumWithAssets);
            setCurrentAssets(shuffledAssets);
            setAssetIndex(0);

            const firstAssetUrl = await getImageWithRetry(shuffledAssets[0].id);
            if (firstAssetUrl) {
              setImageA({ url: firstAssetUrl, id: shuffledAssets[0].id });
              setImageB({ url: '', id: 'clearedB' }); // Ensure B is cleared
              setIsAVisible(true);
            } else {
              throw new Error('Could not load first image of the album.');
            }
            foundSuitableAlbum = true;
          } else {
             // Move to the next album
            albumIndex.current = (albumIndex.current + 1) % albumPlaylist.current.length;
            // If we've looped through all albums and found nothing
            if (albumIndex.current === initialAlbumIndex) {
              setError(`No photos matching the '${DISPLAY_MODE}' orientation filter could be found in any of your ${albumPlaylist.current.length} albums.`);
              setIsLoading(false);
              return;
            }
          }
        } catch (e: any) {
          console.error(e);
          // Try next album on error
          albumIndex.current = (albumIndex.current + 1) % albumPlaylist.current.length;
          if (albumIndex.current === initialAlbumIndex) {
            setError(`After trying all albums, failed to load any photos. Last error: ${e.message}`);
            setIsLoading(false);
            return;
          }
        }
      }
      setIsLoading(false);
    };

    // This effect should only run when we need to load a new album,
    // which is on startup or when currentAssets becomes empty.
    if(currentAssets.length === 0 && !areConfigsMissing) {
        findAndLoadAlbum();
    }

  }, [areConfigsMissing, getImageWithRetry, currentAssets.length]);

  // Image rotation timer
  useEffect(() => {
    if (currentAssets.length === 0 || isLoading || error) return;
    
    const timer = setTimeout(() => {
      loadNextAsset();
    }, DURATION);

    return () => clearTimeout(timer);
  }, [assetIndex, currentAssets, isLoading, error, loadNextAsset]);
  
  // When next image is loaded, trigger the visibility switch
  useEffect(() => {
    if (!nextImageLoaded) return;
    
    const newIsAVisible = !isAVisible;
    setIsAVisible(newIsAVisible);
    setNextImageLoaded(false);

    // After the transition starts, clean up the old image's Object URL
    // to prevent memory leaks.
    setTimeout(() => {
        if (newIsAVisible) { // A is now visible, so B was the old one
            if(imageB.url) URL.revokeObjectURL(imageB.url);
            setImageB({url: '', id: 'clearedB'});
        } else { // B is now visible, so A was the old one
            if(imageA.url) URL.revokeObjectURL(imageA.url);
            setImageA({url: '', id: 'clearedA'});
        }
    }, 1000); // This should match the CSS transition duration

  }, [nextImageLoaded, isAVisible, imageA.url, imageB.url]);


  // Progress bar animation
  useEffect(() => {
    if (isLoading || error) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + (100 / (DURATION / 100)), 100));
    }, 100);
    return () => clearInterval(interval);
  }, [assetIndex, isLoading, error]); 

  // Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
      setCurrentDate(now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 1000);
    return () => clearInterval(clockInterval);
  }, []);
  
  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-background text-foreground">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-lg">Searching for photos...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <Alert variant="destructive" className="max-w-lg">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (currentAssets.length === 0 && !isLoading) {
     return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Photos To Display</AlertTitle>
          <AlertDescription>
            Could not find any suitable photos on your Immich server. Check your configuration and albums.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const location = [currentAsset?.exifInfo?.city, currentAsset?.exifInfo?.country].filter(Boolean).join(', ');
  const dateString = currentAsset?.exifInfo?.dateTimeOriginal;
  const photoDate = dateString ? new Date(dateString) : null;
  const isDateValid = photoDate && !isNaN(photoDate.getTime());


  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Image A Container */}
      <div className={cn('absolute inset-0 transition-opacity duration-1000 ease-in-out', isAVisible ? 'opacity-100' : 'opacity-0')}>
        {imageA.url && (
          <>
            <Image
              key={`${imageA.id}-bg`}
              src={imageA.url}
              alt=""
              aria-hidden="true"
              fill
              className="object-cover blur-2xl scale-110"
              unoptimized
            />
            <Image
              key={imageA.id}
              src={imageA.url}
              alt="Immich Photo"
              fill
              className="object-contain"
              onLoad={() => {
                 if (!isAVisible) setNextImageLoaded(true);
              }}
              priority
              unoptimized
            />
          </>
        )}
      </div>

      {/* Image B Container */}
      <div className={cn('absolute inset-0 transition-opacity duration-1000 ease-in-out', !isAVisible ? 'opacity-100' : 'opacity-0')}>
        {imageB.url && (
          <>
            <Image
              key={`${imageB.id}-bg`}
              src={imageB.url}
              alt=""
              aria-hidden="true"
              fill
              className="object-cover blur-2xl scale-110"
              unoptimized
            />
            <Image
              key={imageB.id}
              src={imageB.url}
              alt="Immich Photo"
              fill
              className="object-contain"
              onLoad={() => {
                if (isAVisible) setNextImageLoaded(true);
              }}
              priority
              unoptimized
            />
          </>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-6 text-white">
        {/* Left Box: Time and Progress */}
        <div className="space-y-2 rounded-lg bg-black/30 p-4 backdrop-blur-md">
          <div className="text-4xl font-semibold md:text-6xl">
            {currentTime}
          </div>
          <div className="text-lg md:text-xl font-medium">
            {currentDate}
          </div>
          <div className="w-full pt-2">
            <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white/80" />
          </div>
        </div>

        {/* Right Box: Photo Details */}
        {(currentAlbum || (currentAsset && isDateValid) || location) && (
          <div className="space-y-2 rounded-lg bg-black/30 p-4 backdrop-blur-md text-right">
              <div className="flex flex-col items-end text-lg md:text-xl font-medium">
                  {currentAlbum && (
                      <div className="flex items-center gap-2">
                          <span>{currentAlbum.albumName}</span>
                          <Folder size={20} className="shrink-0" />
                      </div>
                  )}
                  {isDateValid && photoDate && (
                       <div className="flex items-center gap-2">
                           <span>{format(photoDate, 'MMMM d, yyyy')}</span>
                          <Calendar size={20} className="shrink-0" />
                      </div>
                  )}
                  {location && (
                      <div className="flex items-center gap-2">
                          <span>{location}</span>
                          <MapPin size={20} className="shrink-0" />
                      </div>
                  )}
              </div>
          </div>
        )}
      </div>
    </main>
  );
}
