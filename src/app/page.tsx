
"use client";

import type { ImmichAsset, AirPollutionData, WeatherData } from '@/lib/types';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, MapPin, Calendar, Folder, Sun, Cloud, CloudRain, Snowflake, CloudSun, Zap, Wind, Droplets, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
const RETRY_DELAY = 5000; // 5 seconds
const WEATHER_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const AIR_POLLUTION_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const MAX_VIDEO_DURATION_SECONDS = 10;
const ASSET_FETCH_PAGE_SIZE = 100;
const LOCAL_STORAGE_PAGE_KEY = 'immich-view-fetch-page';

// --- Environment Variable-based Configuration ---
const DISPLAY_MODE = process.env.NEXT_PUBLIC_DISPLAY_MODE; // 'portrait', 'landscape', or 'all'
const SERVER_URL_CONFIGURED = !!process.env.NEXT_PUBLIC_IMMICH_SERVER_URL;
const API_KEY = process.env.NEXT_PUBLIC_IMMICH_API_KEY;
const IS_FAVORITE_ONLY = process.env.NEXT_PUBLIC_IMMICH_IS_FAVORITE_ONLY === 'true';
const IS_ARCHIVED_INCLUDED = process.env.NEXT_PUBLIC_IMMICH_INCLUDE_ARCHIVED === 'true';
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

const parseDuration = (duration: string): number => {
    const parts = duration.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
};


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

type MediaAsset = {
  id: string;
  url: string;
  type: 'IMAGE' | 'VIDEO';
};

export default function Home() {
  const { toast } = useToast();
  
  // --- State Management ---
  const [playlist, setPlaylist] = useState<ImmichAsset[]>([]);
  const [assetIndex, setAssetIndex] = useState(0);
  const [fetchPage, setFetchPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [airPollution, setAirPollution] = useState<AirPollutionData | null>(null);

  const [mediaA, setMediaA] = useState<MediaAsset | null>(null);
  const [mediaB, setMediaB] = useState<MediaAsset | null>(null);
  const [isAVisible, setIsAVisible] = useState(true);
  const [nextMediaLoaded, setNextMediaLoaded] = useState(false);

  const configError = useMemo(() => {
    if (!SERVER_URL_CONFIGURED || !API_KEY) {
      return "Server URL or API Key is missing. Please check your environment variables.";
    }
    if (DISPLAY_MODE && !['portrait', 'landscape', 'all'].includes(DISPLAY_MODE)) {
      return `Invalid value for NEXT_PUBLIC_DISPLAY_MODE. It must be one of 'portrait', 'landscape', or 'all'. Found: ${DISPLAY_MODE}`;
    }
    return null;
  }, []);
  
  const currentAsset = useMemo(() => playlist[assetIndex], [playlist, assetIndex]);

  // --- Asset Fetching Logic ---
  const getAssetUrl = useCallback(async (asset: ImmichAsset): Promise<string | null> => {
    if (configError) return null;
    const endpoint = asset.type === 'VIDEO' ? 'video' : 'thumbnail';
    const sizeParam = asset.type === 'VIDEO' ? '' : '?size=preview';
    
    try {
      const res = await fetch(`${PROXY_URL}/assets/${asset.id}/${endpoint}${sizeParam}`, {
        method: 'GET',
        headers: { 'x-api-key': API_KEY as string },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch ${asset.type}: ${res.statusText}`);
      }
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    } catch (e: any)      {
        console.error(`Error fetching asset ${asset.id}:`, e);
        toast({
            variant: "destructive",
            title: "Asset Fetch Error",
            description: `Could not load ${asset.type} ${asset.id}.`,
        });
        return null;
    }
  }, [configError, toast]);
  
  const getAssetWithRetry = useCallback(async (asset: ImmichAsset, retries = 1): Promise<string | null> => {
      let url = await getAssetUrl(asset);
      if (url) return url;
      
      if (retries > 0) {
          toast({
              title: "Retrying Asset Load",
              description: `Will retry loading in ${RETRY_DELAY / 1000} seconds.`,
          });
          await delay(RETRY_DELAY);
          return await getAssetWithRetry(asset, retries - 1);
      }
      
      toast({
          variant: "destructive",
          title: "Asset Load Failed",
          description: `Skipping asset ${asset.id} after multiple attempts.`,
      });
      return null;
  }, [getAssetUrl, toast]);


  const loadNextAsset = useCallback(async () => {
    let nextIndex = assetIndex + 1;

    // If we're near the end of the playlist, fetch more assets
    if (nextIndex >= playlist.length - 5) {
      setFetchPage(p => p + 1);
    }
    
    // If we've reached the end, loop back
    if (nextIndex >= playlist.length) {
      nextIndex = 0;
    }

    const nextAsset = playlist[nextIndex];
    if (!nextAsset) return;

    const newUrl = await getAssetWithRetry(nextAsset);

    if (newUrl) {
      const newMedia: MediaAsset = { url: newUrl, id: nextAsset.id, type: nextAsset.type };
      if (isAVisible) {
        setMediaB(newMedia);
      } else {
        setMediaA(newMedia);
      }
      setAssetIndex(nextIndex);
    } else {
      // If asset fails to load, try the next one immediately
      setAssetIndex(i => i + 1);
    }
  }, [assetIndex, playlist, getAssetWithRetry, isAVisible]);


  // --- Effects ---

  // Load page from localStorage on mount
  useEffect(() => {
    const savedPage = localStorage.getItem(LOCAL_STORAGE_PAGE_KEY);
    if (savedPage) {
        setFetchPage(parseInt(savedPage, 10));
    }
  }, []);

  // Save page to localStorage
  useEffect(() => {
    if (fetchPage > 1) { // Don't save initial value
      localStorage.setItem(LOCAL_STORAGE_PAGE_KEY, fetchPage.toString());
    }
  }, [fetchPage]);


  // Main logic to fetch assets from search endpoint
  useEffect(() => {
    if (configError) {
      setError(configError);
      setIsLoading(false);
      return;
    }

    const fetchAssets = async () => {
      if(fetchPage === 1) setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`${PROXY_URL}/search/metadata`, {
          method: 'POST',
          headers: { 
            'x-api-key': API_KEY as string, 
            'Content-Type': 'application/json',
            'Accept': 'application/json' 
          },
          body: JSON.stringify({
              isFavorite: IS_FAVORITE_ONLY,
              isArchived: IS_ARCHIVED_INCLUDED ? undefined : false,
              page: fetchPage,
              size: ASSET_FETCH_PAGE_SIZE,
          })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch assets: ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        const fetchedAssets: ImmichAsset[] = data.assets.items;
        
        if (fetchPage === 1 && fetchedAssets.length === 0) {
          setError(`No photos/videos found matching your filters (favorites_only: ${IS_FAVORITE_ONLY}, archived_included: ${IS_ARCHIVED_INCLUDED}).`);
          setIsLoading(false);
          return;
        }

        let filteredAssets = fetchedAssets.filter(asset => {
            if (asset.type === 'VIDEO') {
                try {
                    const videoDuration = parseDuration(asset.duration);
                    if (videoDuration > MAX_VIDEO_DURATION_SECONDS) return false;
                } catch (e) {
                    console.warn(`Could not parse duration for video ${asset.id}: ${asset.duration}`);
                    return false;
                }
            }
            
            if (DISPLAY_MODE && DISPLAY_MODE !== 'all') {
                const orientation = asset.exifInfo?.orientation;
                if (orientation) {
                    if (DISPLAY_MODE === 'landscape') return orientation === 1;
                    if (DISPLAY_MODE === 'portrait') return [6, 8].includes(orientation);
                }
                const width = asset.exifInfo?.exifImageWidth;
                const height = asset.exifInfo?.exifImageHeight;
                if (width && height && width > 0 && height > 0) {
                    if (DISPLAY_MODE === 'landscape') return width > height;
                    if (DISPLAY_MODE === 'portrait') return height > width;
                }
                return false;
            }
            return true;
        });

        const newPlaylist = fetchPage === 1 ? shuffleArray(filteredAssets) : [...playlist, ...shuffleArray(filteredAssets)];
        setPlaylist(newPlaylist);

        if (fetchPage === 1 && newPlaylist.length > 0) {
            const firstAsset = newPlaylist[0];
            const firstUrl = await getAssetWithRetry(firstAsset);
            if (firstUrl) {
                setMediaA({ url: firstUrl, id: firstAsset.id, type: firstAsset.type });
                setMediaB(null);
                setIsAVisible(true);
            } else {
                // If first asset fails, try the next one
                setAssetIndex(1);
            }
        }
        
      } catch (e: any) {
          setError(`Failed to connect to Immich server: ${e.message}`);
      } finally {
          setIsLoading(false);
      }
    };

    fetchAssets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configError, fetchPage]);

  // Asset rotation timer
  useEffect(() => {
    if (playlist.length === 0 || isLoading || error) return;
    
    let displayDuration = DURATION;
    const currentMedia = isAVisible ? mediaA : mediaB;
    if (currentMedia?.type === 'VIDEO') {
        const asset = playlist.find(p => p.id === currentMedia.id);
        if (asset) {
            displayDuration = parseDuration(asset.duration) * 1000;
        }
    }

    const timer = setTimeout(() => {
      loadNextAsset();
    }, displayDuration);

    return () => clearTimeout(timer);
  }, [assetIndex, playlist, isLoading, error, loadNextAsset, isAVisible, mediaA, mediaB]);
  
  // When next media is loaded, trigger the visibility switch
  useEffect(() => {
    if (!nextMediaLoaded) return;
    
    const newIsAVisible = !isAVisible;
    setIsAVisible(newIsAVisible);
    setNextMediaLoaded(false);

    // After the transition starts, clean up the old media's Object URL
    setTimeout(() => {
        const oldMedia = newIsAVisible ? mediaB : mediaA;
        if(oldMedia?.url) URL.revokeObjectURL(oldMedia.url);

        if (newIsAVisible) { 
            setMediaB(null);
        } else {
            setMediaA(null);
        }
    }, 1000); // This should match the CSS transition duration

  }, [nextMediaLoaded, isAVisible, mediaA, mediaB]);


  // Progress bar animation
  useEffect(() => {
    if (isLoading || error || playlist.length === 0) return;
    setProgress(0);

    let displayDuration = DURATION;
    const currentMedia = isAVisible ? mediaA : mediaB;
    if (currentMedia?.type === 'VIDEO') {
        const asset = playlist.find(p => p.id === currentMedia.id);
        if (asset) {
            displayDuration = parseDuration(asset.duration) * 1000;
        }
    }
    
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + (100 / (displayDuration / 100)), 100));
    }, 100);
    return () => clearInterval(interval);
  }, [assetIndex, isLoading, error, playlist, isAVisible, mediaA, mediaB]); 

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
                feelsLike: Math.round(data.main.feels_like),
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
  
  if (playlist.length === 0 && !isLoading) {
     return (
      <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No Media To Display</AlertTitle>
          <AlertDescription>
            Could not find any suitable photos or videos on your Immich server. Check your configuration.
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

  const renderMedia = (media: MediaAsset | null) => {
    if (!media) return null;
    if (media.type === 'VIDEO') {
        return (
            <>
                {/* No background for videos as they fill the screen */}
                <video
                    key={media.id}
                    src={media.url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="object-contain w-full h-full"
                    onLoadedData={() => setNextMediaLoaded(true)}
                />
            </>
        )
    }
    return (
        <>
            <Image
                key={`${media.id}-bg`}
                src={media.url}
                alt=""
                aria-hidden="true"
                fill
                className="object-cover blur-2xl scale-110"
            />
            <div className="absolute inset-0 bg-black/50"></div>
            <Image
                key={media.id}
                src={media.url}
                alt="Immich Photo"
                fill
                className="object-contain"
                onLoad={() => setNextMediaLoaded(true)}
                priority
            />
        </>
    );
  }


  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Media A Container */}
      <div className={cn('absolute inset-0 transition-opacity duration-1000 ease-in-out', isAVisible ? 'opacity-100' : 'opacity-0')}>
        {renderMedia(mediaA)}
      </div>

      {/* Media B Container */}
      <div className={cn('absolute inset-0 transition-opacity duration-1000 ease-in-out', !isAVisible ? 'opacity-100' : 'opacity-0')}>
        {renderMedia(mediaB)}
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
                   <div className="flex flex-col items-end text-sm text-white/80 pt-1">
                      <div className="flex items-center gap-1.5">
                          <Thermometer size={16} />
                          <span>Feels like {weather.feelsLike}°</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                            <Wind size={16} />
                            <span>{weather.windSpeed} km/h</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Droplets size={16} />
                            <span>{weather.humidity}%</span>
                        </div>
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
          <div className="text-2xl md:text-3xl font-medium text-white/90">
            {currentDate}
          </div>
          <div className="w-full pt-2">
            <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white" />
          </div>
        </div>

        {/* Right Box: Photo Details */}
        {(isDateValid || location) && (
          <div className="space-y-1.5 rounded-lg bg-black/30 p-4 backdrop-blur-sm text-right">
              <div className="flex flex-col items-end text-lg md:text-xl font-medium">
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

    

    

    