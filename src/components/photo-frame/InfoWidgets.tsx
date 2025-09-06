
"use client";

import type { WeatherData, AirPollutionData, ImmichAsset } from '@/lib/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Sun, Cloud, CloudRain, Snowflake, CloudSun, Zap, Wind, Droplets, Thermometer, Camera, Aperture, MapPin, Calendar, Settings, Hash } from 'lucide-react';

// --- Helper Functions ---
const getWeatherInfo = (code: number): { Icon: React.ElementType, name: string } => {
    if (code >= 200 && code < 300) return { Icon: Zap, name: 'Thunderstorm' };
    if (code >= 300 && code < 400) return { Icon: CloudRain, name: 'Drizzle' };
    if (code >= 500 && code < 600) return { Icon: CloudRain, name: 'Rain' };
    if (code >= 600 && code < 700) return { Icon: Snowflake, name: 'Snow' };
    if (code >= 700 && code < 800) return { Icon: Cloud, name: 'Atmosphere' };
    if (code === 800) return { Icon: Sun, name: 'Clear' };
    if (code === 801) return { Icon: CloudSun, name: 'Few clouds' };
    if (code > 801) return { Icon: Cloud, name: 'Clouds' };
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

// --- Time Widget ---
interface TimeWidgetProps {
  currentTime: string;
  currentDate: string;
  progress: number;
}
export function TimeWidget({ currentTime, currentDate, progress }: TimeWidgetProps) {
  return (
    <div className="w-[240px] space-y-1 rounded-lg bg-black/30 p-3 backdrop-blur-sm">
      <div className="text-5xl font-semibold">
        {currentTime}
      </div>
      <div className="text-xl font-medium text-white/90">
        {currentDate}
      </div>
      <div className="w-full pt-2">
        <Progress value={progress} className="h-1 bg-white/20 [&>div]:bg-white" />
      </div>
    </div>
  );
}


// --- Weather Widget ---
interface WeatherWidgetProps {
  weather: WeatherData | null;
}
export function WeatherWidget({ weather }: WeatherWidgetProps) {
  if (!weather) return null;
  const weatherInfo = getWeatherInfo(weather.weatherCode);

  return (
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
  );
}


// --- Air Pollution Widget ---
interface AirPollutionWidgetProps {
  airPollution: AirPollutionData | null;
  children: React.ReactNode;
}
export function AirPollutionWidget({ airPollution, children }: AirPollutionWidgetProps) {
  if (!airPollution) return null;
  const aqiInfo = getAqiInfo(airPollution.main.aqi);

  return (
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
          {children}
        </div>
      </div>
    </div>
  );
}


// --- Settings Popover ---
interface SettingsPopoverProps {
  onDateSelect: (date: Date) => void;
  onDateReset: () => void;
}
export function SettingsPopover({ onDateSelect, onDateReset }: SettingsPopoverProps) {
  return (
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
            <p className="text-sm text-muted-foreground">Jump to a specific date.</p>
          </div>
          <div className='flex flex-col items-center gap-2'>
            <CalendarPicker
              mode="single"
              onSelect={(date) => date && onDateSelect(date)}
              initialFocus
            />
            <Button variant="outline" onClick={onDateReset} className='w-full'>
              Reset to Latest
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}


// --- Photo Details Widget ---
interface PhotoDetailsWidgetProps {
  asset: ImmichAsset | undefined | null;
}
export function PhotoDetailsWidget({ asset }: PhotoDetailsWidgetProps) {
  if (!asset) return null;

  const { id, exifInfo, fileCreatedAt } = asset;
  const location = [exifInfo?.city, exifInfo?.state].filter(Boolean).join(', ');
  const photoDate = fileCreatedAt ? new Date(fileCreatedAt) : null;
  const isDateValid = photoDate && !isNaN(photoDate.getTime());

  const camera = [exifInfo?.make, exifInfo?.model].filter(Boolean).join(' ');
  const exposure = [
    exifInfo?.fNumber ? `ƒ/${exifInfo.fNumber}` : null,
    exifInfo?.exposureTime ? `1/${Math.round(1 / exifInfo.exposureTime)}s` : null,
    exifInfo?.iso ? `ISO ${exifInfo.iso}` : null,
  ].filter(Boolean).join(' • ');

  if (!isDateValid && !location && !camera && !exposure) {
    return null;
  }

  return (
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
        {exposure && (
          <div className="flex items-center gap-2 text-sm text-white/80 pt-1">
            <span>{exposure}</span>
            <Aperture size={18} className="shrink-0" />
          </div>
        )}
        {id && (
          <div className="flex items-center gap-2 text-xs text-white/60 pt-2">
            <span className='font-mono'>{id}</span>
            <Hash size={14} className="shrink-0" />
          </div>
        )}
      </div>
    </div>
  );
}
