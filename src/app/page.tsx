
"use client";

import type { ImmichAlbum, ImmichAsset, AirPollutionData, WeatherData } from '@/lib/types';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, MapPin, Calendar, Folder, Sun, Cloud, CloudRain, Snowflake, CloudSun, Zap, Wind, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
const RETRY_DELAY = 5000; // 5 seconds
const WEATHER_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const AIR_POLLUTION_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// --- Environment Variable-based Configuration ---
const DISPLAY_MODE = process.env.NEXT_PUBLIC_DISPLAY_MODE; // 'portrait', 'landscape', or 'all'
const SERVER_URL_CONFIGURED = !!process.env.NEXT_PUBLIC_IMMICH_SERVER_URL;
const API_KEY = process.env.NEXT_PUBLIC_IMMICH_API_KEY;
const IS_FAVORITE_ONLY = process.env.NEXT_PUBLIC_IMMICH_IS_FAVORITE_ONLY === 'true';
const LATITUDE = process.env.NEXT_PUBLIC_LATITUDE;
const LONGITUDE = process.env.NEXT_PUBLIC_LONGITUDE;
const OPENWEATHER_API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;


// We use a local proxy to avoid CORS issues for Immich.
const PROXY_URL = '/api/immich';

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

const getWeatherInfo = (code: number): { Icon: React.ElementType, name: string } => {
    // OpenWeatherMap Weather condition codes
    if (code >= 200 && code < 300) return { Icon: Zap, name: 'Thunderstorm' };
    if (code >= 300 && code < 400) return { Icon: CloudRain, name: 'Drizzle' };
    if (code >= 500 && code < 600) return { Icon: CloudRain, name: 'Rain' };
    if (code >= 600 && code < 700) return { Icon: Snowflake, name: 'Snow' };
    if (code >= 700 && code < 800) return { Icon: Cloud, name: 'Atmosphere' };
    if (code === 800) return { Icon: Sun, name: 'Clear' };
    if (code === 801) return { Icon: CloudSun, name: 'Few clouds' };
    if (code > 801 && code < 805) return { Icon: Cloud, name: 'Clouds' };
    return { Icon: Cloud, name: 'Cloudy' };
}

const getAqiInfo = (aqi: number): { label: string; color: string } => {
    switch (aqi) {
        case 1: return { label: 'Good', color: 'text-green-400' };
        case 2: return { label: 'Fair', color: 'text-yellow-400' };
        case 3: return { label: 'Moderate', color: 'text-orange-400' };
        case 4: return { label: 'Poor', color: 'text-red-500' };
        case 5: return { label: 'Very Poor', color: 'text-purple-500' };
        default: return { label: 'Unknown', color: 'text-white' };
    }
}


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
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [airPollution, setAirPollution] = useState<AirPollutionData | null>(null);


  const [imageA, setImageA] = useState<{ url: string, id: string }>({ url: '', id: 'initialA' });
  const [imageB, setImageB] = useState<{ url: string, id: string }>({ url: '', id: 'initialB' });
  const [isAVisible, setIsAVisible] = useState(true);
  const [nextImageLoaded, setNextImageLoaded] = useState(false);

  // Refs to hold the full list of albums and our position in it
  const albumPlaylist = useRef<ImmichAlbum[]>([]);
  const albumIndex = useRef(0);

  const configError = useMemo(() => {
    if (!SERVER_URL_CONFIGURED || !API_KEY) {
      return "Server URL or API Key is missing. Please check your environment variables.";
    }
    if (DISPLAY_MODE && !['portrait', 'landscape', 'all'].includes(DISPLAY_MODE)) {
      return `Invalid value for NEXT_PUBLIC_DISPLAY_MODE. It must be one of 'portrait', 'landscape', or 'all'. Found: ${DISPLAY_MODE}`;
    }
    return null;
  }, []);
  
  const currentAsset = useMemo(() => currentAssets[assetIndex], [currentAssets, assetIndex]);

  // --- Image Fetching Logic ---
  const getImageUrl = useCallback(async (assetId: string): Promise<string | null> => {
    if (configError) return null;
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
  }, [configError, toast]);
  
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
    
    // If we've reached the end of the current album's assets
    if (nextAssetIndex >= currentAssets.length) {
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
    if (configError) {
      setError(configError);
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
          albumIndex.current = 0; // Start from the beginning of the shuffled list
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
          
          if (DISPLAY_MODE && DISPLAY_MODE !== 'all') {
            fetchedAssets = fetchedAssets.filter(asset => {
              const orientation = asset.exifInfo?.orientation;
              // Prioritize orientation tag
              if (orientation) {
                if (DISPLAY_MODE === 'landscape') return orientation === 1;
                if (DISPLAY_MODE === 'portrait') return [6, 8].includes(orientation);
              }
              // Fallback to dimensions
              const width = asset.exifInfo?.exifImageWidth;
              const height = asset.exifInfo?.exifImageHeight;
              if (width && height && width > 0 && height > 0) {
                  if (DISPLAY_MODE === 'landscape') return width > height;
                  if (DISPLAY_MODE === 'portrait') return height > width;
              }
              return false;
            });
          }
          
          // Move to the next album index for the next cycle
          albumIndex.current = (albumIndex.current + 1) % albumPlaylist.current.length;

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
             // If we've looped through all albums and found nothing
            if (albumIndex.current === initialAlbumIndex) {
              setError(`No photos matching your filters (display_mode: ${DISPLAY_MODE}, favorites_only: ${IS_FAVORITE_ONLY}) could be found in any of your ${albumPlaylist.current.length} albums.`);
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
    if(currentAssets.length === 0 && !configError) {
        findAndLoadAlbum();
    }

  }, [configError, getImageWithRetry, currentAssets.length]);

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

  // Weather
  useEffect(() => {
    if (!LATITUDE || !LONGITUDE || !OPENWEATHER_API_KEY) return;

    const fetchWeather = async () => {
        try {
            const weatherResponse = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${OPENWEATHER_API_KEY}&units=metric`);
            if (!weatherResponse.ok) throw new Error('Failed to fetch weather data.');
            const data = await weatherResponse.json();
            setWeather({
                temperature: Math.round(data.main.temp),
                weatherCode: data.weather[0].id,
                description: data.weather[0].description,
                windSpeed: Math.round(data.wind.speed * 3.6),
                humidity: data.main.humidity,
            });
        } catch (e: any) {
            console.error("Failed to fetch weather:", e);
            toast({
                variant: 'destructive',
                title: 'Weather Update Failed',
                description: e.message,
            });
        }
    }
    
    fetchWeather();
    const weatherInterval = setInterval(fetchWeather, WEATHER_REFRESH_INTERVAL);

    return () => clearInterval(weatherInterval);
  }, [toast]);

  // Air Pollution
  useEffect(() => {
    if (!LATITUDE || !LONGITUDE || !OPENWEATHER_API_KEY) return;

    const fetchAirPollution = async () => {
        try {
            const response = await fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${LATITUDE}&lon=${LONGITUDE}&appid=${OPENWEATHER_API_KEY}`);
            if (!response.ok) throw new Error('Failed to fetch air pollution data.');
            const data = await response.json();
            if (data.list && data.list.length > 0) {
                setAirPollution(data.list[0]);
            }
        } catch (e: any) {
            console.error("Failed to fetch air pollution:", e);
            toast({
                variant: 'destructive',
                title: 'Air Pollution Update Failed',
                description: e.message,
            });
        }
    };

    fetchAirPollution();
    const interval = setInterval(fetchAirPollution, AIR_POLLUTION_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [toast]);
  
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
          <AlertTitle>Configuration Error</AlertTitle>
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
  
  const weatherInfo = weather ? getWeatherInfo(weather.weatherCode) : null;
  const aqiInfo = airPollution ? getAqiInfo(airPollution.main.aqi) : null;


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
            />
            <div className="absolute inset-0 bg-black/50"></div>
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
            />
            <div className="absolute inset-0 bg-black/50"></div>
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
            />
          </>
        )}
      </div>

      {/* Top Left: Air Pollution */}
      {airPollution && aqiInfo && (
        <div className="pointer-events-none absolute top-4 left-4 text-white">
            <div className="space-y-1 rounded-lg bg-black/30 p-3 backdrop-blur-sm text-left">
                <div className="flex items-center gap-3">
                    <Wind size={32} />
                    <div className='flex items-baseline gap-2'>
                        <span className="text-4xl font-bold">{airPollution.main.aqi}</span>
                        <span className={cn("text-2xl font-medium", aqiInfo.color)}>{aqiInfo.label}</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm text-white/80 pt-1">
                    <span>PM2.5: {airPollution.components.pm2_5.toFixed(1)}</span>
                    <span>NO₂: {airPollution.components.no2.toFixed(1)}</span>
                    <span>PM10: {airPollution.components.pm10.toFixed(1)}</span>
                    <span>SO₂: {airPollution.components.so2.toFixed(1)}</span>
                </div>
            </div>
        </div>
      )}

      {/* Top Right: Weather */}
      {weather && weatherInfo && (
          <div className="pointer-events-none absolute top-4 right-4 text-white">
              <div className="space-y-1 rounded-lg bg-black/30 p-3 backdrop-blur-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                      <span className="text-5xl font-bold">{weather.temperature}°</span>
                      <weatherInfo.Icon size={48} className="shrink-0" />
                  </div>
                  <div className="text-base font-medium text-white/90 capitalize">
                      {weather.description}
                  </div>
                  <div className="flex justify-end gap-x-4 text-sm text-white/80 pt-1">
                      <div className="flex items-center gap-1.5">
                          <span>{weather.windSpeed} km/h</span>
                          <Wind size={16} />
                      </div>
                      <div className="flex items-center gap-1.5">
                          <span>{weather.humidity}%</span>
                          <Droplets size={16} />
                      </div>
                  </div>
              </div>
          </div>
      )}


      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-6 text-white">
        {/* Left Box: Time and Progress */}
        <div className="space-y-2 rounded-lg bg-black/30 p-4 backdrop-blur-sm">
          <div className="text-5xl font-semibold md:text-7xl">
            {currentTime}
          </div>
          <div className="text-lg md:text-xl font-medium text-white/90">
            {currentDate}
          </div>
          <div className="w-full pt-2">
            <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white" />
          </div>
        </div>

        {/* Right Box: Photo Details */}
        {(currentAlbum || (currentAsset && isDateValid) || location) && (
          <div className="space-y-1.5 rounded-lg bg-black/30 p-4 backdrop-blur-sm text-right">
              <div className="flex flex-col items-end text-lg md:text-xl font-medium">
                  {currentAlbum && (
                      <div className="flex items-center gap-2">
                          <span>{currentAlbum.albumName}</span>
                          <Folder size={20} className="shrink-0" />
                      </div>
                  )}
                  {isDateValid && photoDate && (
                       <div className="flex items-center gap-2 text-base text-white/90">
                           <span>{format(photoDate, 'MMMM d, yyyy')}</span>
                          <Calendar size={18} className="shrink-0" />
                      </div>
                  )}
                  {location && (
                      <div className="flex items-center gap-2 text-base text-white/90">
                          <span>{location}</span>
                          <MapPin size={18} className="shrink-0" />
                      </div>
                  )}
              </div>
          </div>
        )}
      </div>
    </main>
  );
}
