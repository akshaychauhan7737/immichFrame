
"use client";

import type { ImmichAsset, AirPollutionData, WeatherData } from '@/lib/types';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, MapPin, Calendar, Sun, Cloud, CloudRain, Snowflake, CloudSun, Zap, Wind, Droplets, Thermometer, Camera, Aperture, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';

// --- Configuration ---
const DURATION = parseInt(process.env.NEXT_PUBLIC_IMAGE_DISPLAY_DURATION || '15000', 10);
const RETRY_DELAY = 5000; // 5 seconds
const WEATHER_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const AIR_POLLUTION_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const ASSET_FETCH_PAGE_SIZE = 25;
const LOCAL_STORAGE_DATE_KEY = 'immich-view-taken-before';

// --- Environment Variable-based Configuration ---
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

type MediaAsset = {
  id: string;
  url: string;
  type: 'IMAGE' | 'VIDEO';
  asset: ImmichAsset;
};

export default function Home() {
  const { toast } = useToast();
  
  // --- State Management ---
  const [playlist, setPlaylist] = useState<ImmichAsset[]>([]);
  const [takenBefore, setTakenBefore] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [progress, setProgress] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [airPollution, setAirPollution] = useState<AirPollutionData | null>(null);
  const [currentMedia, setCurrentMedia] = useState<MediaAsset | null>(null);
  const [nextMedia, setNextMedia] = useState<MediaAsset | null>(null);
  const [isFading, setIsFading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  const configError = useMemo(() => {
    if (!SERVER_URL_CONFIGURED || !API_KEY) {
      return "Server URL or API Key is missing. Please check your environment variables.";
    }
    return null;
  }, []);
  
  const currentAsset = useMemo(() => {
    return currentMedia?.asset;
  }, [currentMedia]);

  // --- Asset Fetching Logic ---
  const getAssetUrl = useCallback(async (asset: ImmichAsset): Promise<string | null> => {
    if (configError) return null;
    
    let url: string;
    const headers: HeadersInit = { 'x-api-key': API_KEY as string };

    if (asset.type === 'VIDEO') {
        url = `${PROXY_URL}/assets/${asset.id}/original`;
    } else { // IMAGE
        url = `${PROXY_URL}/assets/${asset.id}/thumbnail?size=preview`;
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: headers,
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
  
  const getAssetWithRetry = useCallback(async (asset: ImmichAsset, retries = 1): Promise<MediaAsset | null> => {
      let url = await getAssetUrl(asset);
      if (url) return {
          id: asset.id,
          type: asset.type as 'IMAGE' | 'VIDEO',
          url: url,
          asset: asset,
      };
      
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


  const preloadNextAsset = useCallback(async (assetList: ImmichAsset[]) => {
      if (assetList.length === 0) {
          setNextMedia(null);
          return assetList;
      }
      
      let nextAsset: ImmichAsset | undefined;
      let preloadedMedia: MediaAsset | null = null;
      let remainingAssets = [...assetList];

      while (!preloadedMedia && remainingAssets.length > 0) {
          nextAsset = remainingAssets.shift(); // Take asset from the front
          if (nextAsset) {
              preloadedMedia = await getAssetWithRetry(nextAsset);
          }
      }
      
      setNextMedia(preloadedMedia);
      return remainingAssets; // Return the list without the preloaded asset
  }, [getAssetWithRetry]);


  const advanceToNextAsset = useCallback(async () => {
    if (!nextMedia) {
      if (!isFetching) setIsFetching(true);
      return;
    }

    setIsFading(true);
    await delay(500);

    if (currentMedia?.url) {
        URL.revokeObjectURL(currentMedia.url);
    }
    
    setCurrentMedia(nextMedia);

    if (nextMedia.asset.createdAt) {
        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, nextMedia.asset.createdAt);
    }
    
    // Preload the next asset and update the playlist
    const remainingAssets = await preloadNextAsset(playlist);
    setPlaylist(remainingAssets);

    setIsFading(false);
  }, [nextMedia, currentMedia, playlist, preloadNextAsset, isFetching]);


  // --- Effects ---
  
  // Load date from localStorage on mount and trigger initial fetch
  useEffect(() => {
    const savedDate = localStorage.getItem(LOCAL_STORAGE_DATE_KEY);
    if (savedDate && savedDate !== 'undefined') {
        setTakenBefore(savedDate);
    }
    setIsFetching(true);
  }, []);
  

  // Main logic to fetch assets from search endpoint
  useEffect(() => {
    const fetchAssets = async () => {
      if (configError) {
        setError(configError);
        setIsLoading(false);
        setIsFetching(false);
        return;
      }

      setError(null);
      
      try {
        const requestBody: any = {
              withExif: true,
              isFavorite: IS_FAVORITE_ONLY,
              isArchived: IS_ARCHIVED_INCLUDED ? undefined : false,
              size: ASSET_FETCH_PAGE_SIZE,
              sort: 'DESC',
        };
        
        if (takenBefore) {
            requestBody.takenBefore = takenBefore;
        }

        const response = await fetch(`${PROXY_URL}/search/metadata`, {
          method: 'POST',
          headers: { 
            'x-api-key': API_KEY as string, 
            'Content-Type': 'application/json',
            'Accept': 'application/json' 
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch assets: ${response.statusText} - ${errorText}`);
        }
        
        const data = await response.json();
        const fetchedAssets: ImmichAsset[] = data.assets.items || [];
        
        if (fetchedAssets.length === 0) {
            if (takenBefore) {
                // Reached the end, loop back
                console.log("No more assets found, starting from the beginning.");
                setTakenBefore(null);
                localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
                // Trigger another fetch from the beginning
                setIsFetching(true); 
            } else {
                // No assets found at all
                setError(`No photos found matching your filters (favorites_only: ${IS_FAVORITE_ONLY}, archived_included: ${IS_ARCHIVED_INCLUDED}).`);
                setIsLoading(false);
            }
            return;
        }
        
        setPlaylist(current => [...current, ...fetchedAssets]);
        
      } catch (e: any) {
          setError(`Failed to connect to Immich server: ${e.message}`);
          await delay(RETRY_DELAY);
          setIsFetching(true); // Retry after a delay
      } finally {
          setIsFetching(false);
      }
    };
    
    if (isFetching) {
        fetchAssets();
    }
  }, [configError, isFetching, takenBefore]);

  // Trigger fetch when playlist runs out
  useEffect(() => {
    if (!isFetching && playlist.length === 0 && currentMedia && !isLoading) {
      console.log("Playlist is empty, fetching more assets.");
      setIsFetching(true);
    }
  }, [playlist, isFetching, currentMedia, isLoading]);


  // Initial asset load and starting the slideshow
  useEffect(() => {
      const startSlideshow = async () => {
          if (playlist.length < 1) return;

          let assetsForFirstLoad = [...playlist];
          
          // 1. Set current media if it's not set
          if (!currentMedia) {
              let firstMedia: MediaAsset | null = null;
              while(!firstMedia && assetsForFirstLoad.length > 0) {
                  const asset = assetsForFirstLoad.shift();
                  if (asset) firstMedia = await getAssetWithRetry(asset);
              }

              if (firstMedia) {
                  setCurrentMedia(firstMedia);
                   if (firstMedia.asset.createdAt) {
                        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, firstMedia.asset.createdAt);
                   }
              } else {
                   setError("Failed to load initial asset(s).");
                   setIsLoading(false);
                   return;
              }
          }

          // 2. Set next media if it's not set
          if (!nextMedia) {
              const remainingAssets = await preloadNextAsset(assetsForFirstLoad);
              setPlaylist(remainingAssets);
          }
          
          setIsLoading(false);
      };

      if (!isLoading && playlist.length > 0 && (!currentMedia || !nextMedia)) {
          startSlideshow();
      }
  }, [isLoading, currentMedia, nextMedia, playlist, getAssetWithRetry, preloadNextAsset]);


  // Asset rotation timer for images
  useEffect(() => {
    if (isLoading || !currentMedia || currentMedia.type === 'VIDEO') return;

    const timer = setTimeout(() => {
        advanceToNextAsset();
    }, DURATION);

    return () => clearTimeout(timer);
  }, [isLoading, currentMedia, advanceToNextAsset]);
  

  const handleDateReset = useCallback(() => {
    localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
    setTakenBefore(null);
    setPlaylist([]);
    setCurrentMedia(null);
    setNextMedia(null);
    setIsFetching(true);
    toast({
        title: "Timeline Reset",
        description: "Slideshow will restart from the most recent photos.",
    });
  }, [toast]);

  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (date) {
        const newDate = date.toISOString();
        localStorage.setItem(LOCAL_STORAGE_DATE_KEY, newDate);
        setTakenBefore(newDate);
        setPlaylist([]);
        setCurrentMedia(null);
        setNextMedia(null);
        setIsFetching(true);
        toast({
            title: "Timeline Set",
            description: `Searching for photos taken before ${format(date, 'PPP')}.`,
        });
    }
  }, [toast]);


  // Progress bar animation
  useEffect(() => {
    if (isLoading || error || !currentMedia) {
      setProgress(0);
      return;
    }
    
    setProgress(0);
    
    let displayDuration = DURATION;
    if (currentMedia.type === 'VIDEO' && videoRef.current && !isNaN(videoRef.current.duration)) {
        displayDuration = videoRef.current.duration * 1000;
    }

    if (displayDuration <= 0) return;

    const interval = setInterval(() => {
      setProgress(p => Math.min(p + (100 / (displayDuration / 100)), 100));
    }, 100);

    return () => clearInterval(interval);
  }, [currentMedia, isLoading, error]); 


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
                windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
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
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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

  const exif = currentAsset?.exifInfo;
  const camera = [exif?.make, exif?.model].filter(Boolean).join(' ');
  const exposure = [
    exif?.fNumber ? `ƒ/${exif.fNumber}` : null,
    exif?.exposureTime ? `1/${Math.round(1 / exif.exposureTime)}s` : null,
    exif?.iso ? `ISO ${exif.iso}` : null,
  ].filter(Boolean).join(' • ');

  const renderMedia = (media: MediaAsset | null) => {
    if (!media) return null;
  
    const containerClasses = cn(
      "absolute inset-0 transition-opacity duration-500",
      isFading ? 'opacity-0' : 'opacity-100'
    );
  
    if (media.type === 'VIDEO') {
      return (
        <div key={media.id} className={containerClasses}>
          <video
            key={`${media.id}-bg`}
            src={media.url}
            aria-hidden="true"
            className="absolute object-cover blur-2xl scale-110 h-full w-full"
            autoPlay
            muted
            loop
          />
          <div className="absolute inset-0 bg-black/50"></div>
          <video
            ref={videoRef}
            key={media.id}
            src={media.url}
            onEnded={advanceToNextAsset}
            onLoadedData={() => {
              if (videoRef.current) {
                setProgress(0);
              }
            }}
            autoPlay
            muted
            className="absolute object-contain h-full w-full"
          />
        </div>
      );
    }
  
    return (
      <div key={media.id} className={containerClasses}>
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
          priority
        />
      </div>
    );
  };


  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {/* Media Container */}
      {!currentMedia && !isLoading && !isFetching && (
        <div className="flex h-screen w-screen items-center justify-center bg-background p-8">
          <Alert className="max-w-md">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Media To Display</AlertTitle>
            <AlertDescription>
              Could not find any suitable photos on your Immich server. Check your configuration.
            </AlertDescription>
          </Alert>
        </div>
      )}
      {renderMedia(currentMedia)}

      {/* Top Left: Air Pollution */}
      {airPollution && aqiInfo && (
        <div className="pointer-events-none absolute top-4 left-4 text-white">
            <div className="relative space-y-1 rounded-lg bg-black/30 p-3 backdrop-blur-sm text-left">
                <div className="flex items-center gap-3">
                    <Wind size={24} />
                    <div className='flex items-baseline gap-2'>
                        <span className="text-3xl font-bold">{airPollution.main.aqi}</span>
                        <span className={cn("text-xl font-medium", aqiInfo.color)}>{aqiInfo.label}</span>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-white/80 pt-1">
                    <span>PM2.5: {airPollution.components.pm2_5.toFixed(1)}</span>
                    <span>NO₂: {airPollution.components.no2.toFixed(1)}</span>
                    <span>PM10: {airPollution.components.pm10.toFixed(1)}</span>
                    <span>SO₂: {airPollution.components.so2.toFixed(1)}</span>
                </div>
                <div className="absolute bottom-1 right-1">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className='pointer-events-auto h-6 w-6 text-white/50 hover:text-white hover:bg-black/30 backdrop-blur-sm'>
                            <Settings className="h-3 w-3" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto">
                            <div className="grid gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-medium leading-none">Timeline Settings</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Control which photos are displayed.
                                    </p>
                                </div>
                                <div className='flex flex-col items-center gap-2'>
                                    <CalendarPicker
                                        mode="single"
                                        onSelect={handleDateSelect}
                                        initialFocus
                                    />
                                    <Button variant="outline" onClick={handleDateReset} className='w-full'>
                                        Reset to Latest
                                    </Button>
                                </div>
                            </div>
                        </PopoverContent>
                    </Popover>
                </div>
            </div>
        </div>
      )}

      {/* Top Right: Weather */}
      {weather && weatherInfo && (
          <div className="pointer-events-none absolute top-4 right-4 text-white">
              <div className="space-y-1 rounded-lg bg-black/30 p-3 backdrop-blur-sm text-right">
                  <div className="flex items-center justify-end gap-2">
                      <span className="text-4xl font-bold">{weather.temperature}°</span>
                      <weatherInfo.Icon size={36} className="shrink-0" />
                  </div>
                  <div className="text-sm font-medium text-white/90 capitalize">
                      {weather.description}
                  </div>
                   <div className="flex flex-col items-end text-xs text-white/80 pt-1">
                      <div className="flex items-center gap-1.5">
                          <Thermometer size={14} />
                          <span>Feels like {weather.feelsLike}°</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5">
                            <Wind size={14} />
                            <span>{weather.windSpeed} km/h</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Droplets size={14} />
                            <span>{weather.humidity}%</span>
                        </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-6 text-white">
        {/* Left Box: Time and Progress */}
        <div className="flex items-end gap-4">
            <div className="w-[160px] space-y-1 rounded-lg bg-black/30 p-3 backdrop-blur-sm">
                <div className="text-3xl font-semibold">
                    {currentTime}
                </div>
                <div className="text-base font-medium text-white/90">
                    {currentDate}
                </div>
                <div className="w-full pt-2">
                    <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white" />
                </div>
            </div>
        </div>


        {/* Right Box: Photo Details */}
        {currentAsset && (isDateValid || location || camera || exif?.lensModel) && (
          <div className="space-y-1.5 rounded-lg bg-black/30 p-4 backdrop-blur-sm text-right max-w-sm">
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
                   {camera && (
                      <div className="flex items-center gap-2 text-base text-white/90">
                          <span className='truncate'>{camera}</span>
                          <Camera size={18} className="shrink-0" />
                      </div>
                  )}
                   {exif?.lensModel && (
                      <div className="flex items-center gap-2 text-base text-white/90">
                          <span className='truncate'>{exif.lensModel}</span>
                          <Aperture size={18} className="shrink-0" />
                      </div>
                  )}
                  {exposure && (
                      <div className="flex items-center gap-2 text-sm text-white/80 pt-1">
                          <span>{exposure}</span>
                      </div>
                  )}
              </div>
          </div>
        )}
      </div>
    </main>
  );
}
