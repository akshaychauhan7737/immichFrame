
"use client";

import type { ImmichAlbum, ImmichAsset } from '@/lib/types';
import { useState, useEffect, useCallback, useMemo } from 'react';
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
  const [assets, setAssets] = useState<ImmichAsset[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<ImmichAlbum | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [progress, setProgress] = useState(0);

  const [imageA, setImageA] = useState<{ url: string, id: string }>({ url: '', id: 'initialA' });
  const [imageB, setImageB] = useState<{ url: string, id: string }>({ url: '', id: 'initialB' });
  const [isAVisible, setIsAVisible] = useState(true);
  const [nextImageLoaded, setNextImageLoaded] = useState(false);


  const areConfigsMissing = useMemo(() => !SERVER_URL_CONFIGURED || !API_KEY, []);
  
  const currentAsset = useMemo(() => assets[currentIndex], [assets, currentIndex]);

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


  const loadNextImage = useCallback(async (nextIndex: number) => {
    if (assets.length === 0) return;
    
    const nextAsset = assets[nextIndex];
    if (!nextAsset) return;

    const newUrl = await getImageWithRetry(nextAsset.id);

    if (newUrl) {
      if (isAVisible) {
        setImageB({ url: newUrl, id: nextAsset.id });
      } else {
        setImageA({ url: newUrl, id: nextAsset.id });
      }
    } else {
      // If we failed to get the image, skip to the next one immediately
      const nextNextIndex = (nextIndex + 1) % assets.length;
      setCurrentIndex(nextNextIndex);
    }
  }, [assets, getImageWithRetry, isAVisible]);


  // --- Effects ---

  // Initial asset loading
  useEffect(() => {
    if (areConfigsMissing) {
      setError("Server URL or API Key is missing. Please check your environment variables.");
      setIsLoading(false);
      return;
    }

    const fetchInitialData = async () => {
      try {
        // 1. Fetch all albums
        const albumsResponse = await fetch(`${PROXY_URL}/albums`, {
          headers: { 
            'x-api-key': API_KEY as string, 
            'Accept': 'application/json',
          },
        });

        if (!albumsResponse.ok) {
           const errorData = await albumsResponse.json();
          throw new Error(`Failed to fetch albums: ${albumsResponse.statusText} - ${errorData.message}`);
        }
        
        const albums: ImmichAlbum[] = await albumsResponse.json();

        if (albums.length === 0) {
          setError("No albums found on the server.");
          setIsLoading(false);
          return;
        }

        // 2. Pick a random album
        const randomAlbum = albums[Math.floor(Math.random() * albums.length)];
        setCurrentAlbum(randomAlbum);

        // 3. Fetch that album's details (which includes the asset list)
         const albumDetailsResponse = await fetch(`${PROXY_URL}/albums/${randomAlbum.id}`, {
          headers: {
            'x-api-key': API_KEY as string,
            'Accept': 'application/json',
          },
        });

        if (!albumDetailsResponse.ok) {
          const errorData = await albumDetailsResponse.json();
          throw new Error(`Failed to fetch album details: ${albumDetailsResponse.statusText} - ${errorData.message}`);
        }

        const albumWithAssets: ImmichAlbum = await albumDetailsResponse.json();
        
        let fetchedAssets = albumWithAssets.assets;

        // 4. Filter for favorites if required
        if (IS_FAVORITE_ONLY) {
          fetchedAssets = fetchedAssets.filter(asset => asset.isFavorite);
        }
        
        // 5. Filter for portrait images
        let portraitAssets = fetchedAssets.filter(asset => 
            asset.exifInfo && 
            (asset.exifInfo.imageHeight ?? 0) > (asset.exifInfo.imageWidth ?? 0)
        );

        if (portraitAssets.length === 0) {
            setError(`No portrait photos found in the selected album "${albumWithAssets.albumName}".`);
            setIsLoading(false);
            return;
        }
        
        setCurrentAlbum(albumWithAssets);


        // 6. Shuffle and set assets, then load the first image
        const shuffledAssets = shuffleArray(portraitAssets);
        setAssets(shuffledAssets);

        const firstAssetUrl = await getImageWithRetry(shuffledAssets[0].id);
        if (firstAssetUrl) {
          setImageA({ url: firstAssetUrl, id: shuffledAssets[0].id });
        } else {
           setError(`Could not load the first image from album "${albumWithAssets.albumName}".`);
           // Try next one if first fails
           const nextIndex = (0 + 1) % shuffledAssets.length;
           setCurrentIndex(nextIndex);
        }
        setIsLoading(false);

      } catch (e: any) {
        console.error(e);
        setError(e.message);
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [areConfigsMissing, getImageWithRetry]);

  // Image rotation timer
  useEffect(() => {
    if (assets.length === 0 || isLoading) return;
    
    const timer = setTimeout(() => {
        const nextAssetIndex = (currentIndex + 1) % assets.length;
        setCurrentIndex(nextAssetIndex);
        // Don't await here, let it run in the background
        loadNextImage(nextAssetIndex);
    }, DURATION);

    return () => clearTimeout(timer);
  }, [currentIndex, assets, isLoading, loadNextImage]);
  
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
  }, [currentIndex, isLoading, error]); 

  // Clock
  useEffect(() => {
    const updateClock = () => {
        setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }));
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
        <p className="mt-4 text-lg">Connecting to Immich...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (assets.length === 0) {
     return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Photos</AlertTitle>
          <AlertDescription>
            Could not find any photos to display. Check your Immich server and album configuration.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const location = [currentAsset?.exifInfo?.city, currentAsset?.exifInfo?.country].filter(Boolean).join(', ');

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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start p-4 md:p-6 text-white">
        <div className="w-full space-y-2 rounded-lg bg-black/30 p-4 backdrop-blur-md">
            {/* Info Section */}
            <div className="flex flex-col text-lg md:text-xl font-medium">
                {currentAlbum && (
                    <div className="flex items-center gap-2">
                        <Folder size={20} className="shrink-0" />
                        <span>{currentAlbum.albumName}</span>
                    </div>
                )}
                {currentAsset && (
                     <div className="flex items-center gap-2">
                        <Calendar size={20} className="shrink-0" />
                        <span>{format(new Date(currentAsset.createdAt), 'MMMM d, yyyy')}</span>
                    </div>
                )}
                {location && (
                    <div className="flex items-center gap-2">
                        <MapPin size={20} className="shrink-0" />
                        <span>{location}</span>
                    </div>
                )}
            </div>

            {/* Clock and Progress */}
            <div className="flex w-full items-end gap-4 pt-2">
              <div className="text-4xl font-semibold md:text-6xl">
                {currentTime}
              </div>
            </div>
            <div className="w-full pt-2">
              <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white/80" />
            </div>
        </div>
      </div>
    </main>
  );
}

    