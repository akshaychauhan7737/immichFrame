
"use client";

import type { ImmichAlbum, ImmichAsset } from '@/lib/types';
import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
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

export default function Home() {
  const { toast } = useToast();
  
  // --- State Management ---
  const [assets, setAssets] = useState<ImmichAsset[]>([]);
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
        console.error(e);
        toast({
            variant: "destructive",
            title: "Image Fetch Error",
            description: `Could not load image ${assetId}.`,
        });
        return null;
    }
  }, [areConfigsMissing, toast]);

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
        
        if (fetchedAssets.length === 0) {
          setError(`No${IS_FAVORITE_ONLY ? ' favorite' : ''} photos found in the selected album "${albumWithAssets.albumName}".`);
          setIsLoading(false);
          return;
        }

        // 5. Shuffle and set assets, then load the first image
        const shuffledAssets = shuffleArray(fetchedAssets);
        setAssets(shuffledAssets);

        const firstAssetUrl = await getImageUrl(shuffledAssets[0].id);
        if (firstAssetUrl) {
          setImageA({ url: firstAssetUrl, id: shuffledAssets[0].id });
        } else {
           setError(`Could not load the first image from album "${albumWithAssets.albumName}".`);
        }
        setIsLoading(false);

      } catch (e: any) {
        console.error(e);
        setError(e.message);
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [areConfigsMissing, getImageUrl]);

  // Image rotation timer
  useEffect(() => {
    if (assets.length === 0 || isLoading) return;
    
    const timer = setTimeout(async () => {
        const nextAssetIndex = (currentIndex + 1) % assets.length;
        const nextAsset = assets[nextAssetIndex];
        const newUrl = await getImageUrl(nextAsset.id);

        if (newUrl) {
            // Preload the next image into the non-visible container
            if (isAVisible) {
                setImageB({ url: newUrl, id: nextAsset.id });
            } else {
                setImageA({ url: newUrl, id: nextAsset.id });
            }
            setCurrentIndex(nextAssetIndex);
        }
    }, DURATION);

    return () => clearTimeout(timer);
  }, [currentIndex, assets, getImageUrl, isLoading, isAVisible]);
  
  // When next image is loaded, trigger the visibility switch
  useEffect(() => {
    // Only run this effect when the next image has loaded
    if (!nextImageLoaded) return;
    
    // Determine which URL belongs to the image that is now hidden and needs to be cleaned up.
    // If A is now visible, B was the old one. If A is not visible, it was the old one.
    const oldUrlToRevoke = isAVisible ? imageB.url : imageA.url;
    
    // Flip visibility
    setIsAVisible(prev => !prev);
    // Reset the loaded flag
    setNextImageLoaded(false);

    // After the transition starts, clean up the old image's Object URL
    // to prevent memory leaks.
    if(oldUrlToRevoke) {
        // Wait for the fade-out to complete before revoking the URL
        setTimeout(() => {
            URL.revokeObjectURL(oldUrlToRevoke);
            // Also clear the state to prevent re-rendering of the old image
             if (isAVisible) { 
                setImageB({url: '', id: 'clearedB'});
            } else {
                setImageA({url: '', id: 'clearedA'});
            }
        }, 1000); // This should match the transition duration
    }

  }, [nextImageLoaded, isAVisible, imageA.url, imageB.url]);


  // Progress bar animation
  useEffect(() => {
    if (isLoading || error) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + (100 / (DURATION / 100)), 100));
    }, 100);
    return () => clearInterval(interval);
  }, [currentIndex, isLoading, error, isAVisible]); // Add isAVisible to restart on change

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

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Image A Container */}
      <div className={cn('absolute inset-0 transition-opacity duration-1000 ease-in-out', isAVisible ? 'opacity-100' : 'opacity-0')}>
        {imageA.url && (
          <>
            {/* Background Image A */}
            <Image
              key={`${imageA.id}-bg`}
              src={imageA.url}
              alt=""
              aria-hidden="true"
              fill
              className="object-cover blur-2xl scale-110"
              unoptimized
            />
            {/* Foreground Image A */}
            <Image
              key={imageA.id}
              src={imageA.url}
              alt="Immich Photo"
              fill
              className="object-contain"
              onLoad={() => {
                 // If A is not supposed to be visible, it means it's the next image loading in the background.
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
            {/* Background Image B */}
            <Image
              key={`${imageB.id}-bg`}
              src={imageB.url}
              alt=""
              aria-hidden="true"
              fill
              className="object-cover blur-2xl scale-110"
              unoptimized
            />
            {/* Foreground Image B */}
            <Image
              key={imageB.id}
              src={imageB.url}
              alt="Immich Photo"
              fill
              className="object-contain"
              onLoad={() => {
                // If A is visible, it means B is the next image loading in the background.
                if (isAVisible) setNextImageLoaded(true);
              }}
              priority
              unoptimized
            />
          </>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start p-4 md:p-6">
        <div className="flex w-full items-end">
          <div className="rounded-lg bg-black/30 px-4 py-2 text-4xl font-semibold text-white backdrop-blur-md md:text-6xl">
            {currentTime}
          </div>
        </div>
        <div className="w-full pt-4">
          <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white/80" />
        </div>
      </div>
    </main>
  );
}

    