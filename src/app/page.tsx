"use client";

import type { MediaAsset } from '@/lib/types';
import { useRef } from 'react';

import { useToast } from '@/hooks/use-toast';
import { useClock } from '@/hooks/useClock';
import { useWeather } from '@/hooks/useWeather';
import { useImmich } from '@/hooks/useImmich';
import { useSlideshow } from '@/hooks/useSlideshow';

import { MediaRenderer } from '@/components/photo-frame/MediaRenderer';
import { TimeWidget, WeatherWidget, AirPollutionWidget, PhotoDetailsWidget, SettingsPopover } from '@/components/photo-frame/InfoWidgets';
import { LoadingScreen, ErrorScreen, NoMediaScreen } from '@/components/photo-frame/StatusScreens';


export default function Home() {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);

  // --- Custom Hooks ---
  const { currentTime, currentDate } = useClock();
  const { weather, airPollution } = useWeather();
  const immich = useImmich();
  
  const {
    currentMedia,
    nextMedia,
    isLoading,
    isFetching,
    isFading,
    progress,
    error,
    handleTimelineChange,
    advanceToNextAsset,
  } = useSlideshow(immich);

  // --- Render Logic ---

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} />;

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black">
      {!currentMedia && !isFetching && <NoMediaScreen />}
      
      {/* Render current and next media for smooth transition */}
      {currentMedia && <MediaRenderer key={'current-' + currentMedia.id} media={currentMedia} isVisible={!isFading} isCurrent={true} videoRef={videoRef} onVideoEnd={advanceToNextAsset} />}
      {nextMedia && <MediaRenderer key={'next-' + nextMedia.id} media={nextMedia} isVisible={false} isCurrent={false} />}

      {/* --- Overlays --- */}
      <AirPollutionWidget airPollution={airPollution}>
        <SettingsPopover onDateSelect={handleTimelineChange} onDateReset={() => handleTimelineChange(null)} />
      </AirPollutionWidget>
      
      <WeatherWidget weather={weather} />
      
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-4 md:p-6 text-white">
        <TimeWidget currentTime={currentTime} currentDate={currentDate} progress={progress} />
        <PhotoDetailsWidget asset={currentMedia?.asset} />
      </div>
    </main>
  );
}
