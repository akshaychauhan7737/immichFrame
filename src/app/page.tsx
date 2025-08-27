
"use client";

import type { ImmichAsset } from '@/lib/types';
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

  const areConfigsMissing = useMemo(() => !SERVER_URL_CONFIGURED || !API_KEY, []);

  // --- Image Fetching Logic ---
  const getImageUrl = useCallback(async (assetId: string): Promise<string | null> => {
    if (areConfigsMissing) return null;
    try {
      // Corrected endpoint for fetching the file
      const res = await fetch(`${PROXY_URL}/asset/file/${assetId}`, {
        method: 'GET', // Use POST for file download as per Immich docs for API key auth in headers
        headers: { 'x-api-key': API_KEY as string },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch image: ${res.statusText}`);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e: any) {
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

    const fetchAssets = async () => {
      try {
        const response = await fetch(`${PROXY_URL}/asset`, {
          headers: { 
            'x-api-key': API_KEY as string, 
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch assets: ${response.statusText}`);
        }
        
        const data: ImmichAsset[] = await response.json();
        
        let imageAssets = data.filter(asset => asset.type === 'IMAGE' && !asset.isArchived);

        if (IS_FAVORITE_ONLY) {
          imageAssets = imageAssets.filter(asset => asset.isFavorite);
        }

        if (imageAssets.length === 0) {
          setError("No images found on the server with the current criteria.");
          setIsLoading(false);
          return;
        }

        const shuffledAssets = shuffleArray(imageAssets);
        setAssets(shuffledAssets);

        // Preload first two images
        const firstUrl = await getImageUrl(shuffledAssets[0].id);
        if (firstUrl) setImageA({ url: firstUrl, id: shuffledAssets[0].id });

        if (shuffledAssets.length > 1) {
          const secondUrl = await getImageUrl(shuffledAssets[1].id);
          if (secondUrl) setImageB({ url: secondUrl, id: shuffledAssets[1].id });
        } else {
          // If only one image, just use it for both slots
          if (firstUrl) setImageB({ url: firstUrl, id: shuffledAssets[0].id });
        }

      } catch (e: any) {
        console.error(e);
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssets();
  }, [areConfigsMissing, getImageUrl]);

  // Image rotation timer
  useEffect(() => {
    if (assets.length === 0 || isLoading) return;

    const timer = setTimeout(async () => {
      const nextAssetIndex = (currentIndex + 1) % assets.length;
      const nextAsset = assets[nextAssetIndex];
      const newUrl = await getImageUrl(nextAsset.id);

      if (newUrl) {
        if (isAVisible) {
          URL.revokeObjectURL(imageB.url);
          setImageB({ url: newUrl, id: nextAsset.id });
        } else {
          URL.revokeObjectURL(imageA.url);
          setImageA({ url: newUrl, id: nextAsset.id });
        }
        setCurrentIndex(nextAssetIndex);
      }
    }, DURATION);

    return () => clearTimeout(timer);
  }, [isAVisible, currentIndex, assets, getImageUrl, isLoading, imageA, imageB]);

  // Progress bar animation
  useEffect(() => {
    if (isLoading || error) return;
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + (100 / (DURATION / 100)), 100));
    }, 100);
    return () => clearInterval(interval);
  }, [isAVisible, currentIndex, isLoading, error]);

  // Clock
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);
  
  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (imageA.url) URL.revokeObjectURL(imageA.url);
      if (imageB.url) URL.revokeObjectURL(imageB.url);
    };
  }, [imageA, imageB]);

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

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-background">
      <div className="absolute inset-0">
        {imageA.url && (
          <Image
            key={imageA.id}
            src={imageA.url}
            alt="Immich Photo"
            fill
            className={cn('object-contain transition-opacity duration-1000 ease-in-out', isAVisible ? 'opacity-100' : 'opacity-0')}
            onLoad={() => {
              if (!isAVisible) setIsAVisible(true);
            }}
            priority
            unoptimized
          />
        )}
        {imageB.url && (
          <Image
            key={imageB.id}
            src={imageB.url}
            alt="Immich Photo"
            fill
            className={cn('object-contain transition-opacity duration-1000 ease-in-out', !isAVisible ? 'opacity-100' : 'opacity-0')}
            onLoad={() => {
              if (isAVisible) setIsAVisible(false);
            }}
            priority
            unoptimized
          />
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 md:p-6">
        <div className="self-start rounded-lg bg-black/30 px-4 py-2 text-4xl font-semibold text-white backdrop-blur-sm md:text-6xl">
          {currentTime}
        </div>
        <div className="w-full">
          <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white/80" />
        </div>
      </div>
    </main>
  );
}
