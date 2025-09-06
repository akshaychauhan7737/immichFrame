
"use client";

import type { MediaAsset } from '@/lib/types';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { RefObject } from 'react';

interface MediaRendererProps {
  media: MediaAsset;
  isVisible: boolean;
  isCurrent: boolean;
  videoRef?: RefObject<HTMLVideoElement>;
  onVideoEnd?: () => void;
}

export function MediaRenderer({ media, isVisible, isCurrent, videoRef, onVideoEnd }: MediaRendererProps) {
  const containerClasses = cn(
    "absolute inset-0 transition-opacity duration-500",
    isVisible ? 'opacity-100' : 'opacity-0'
  );

  const backgroundUrl = media.previewUrl;

  if (media.type === 'VIDEO') {
    return (
      <div className={containerClasses}>
        {/* Blurred Background */}
        <Image
          src={backgroundUrl}
          alt=""
          aria-hidden="true"
          fill
          className="object-cover blur-2xl scale-110"
        />
        <div className="absolute inset-0 bg-black/50"></div>
        
        {/* Main Video */}
        <video
          ref={isCurrent ? videoRef : null}
          src={media.url}
          onEnded={onVideoEnd}
          muted
          className="absolute object-contain h-full w-full"
        />
      </div>
    );
  }

  // Image Renderer
  return (
    <div className={containerClasses}>
      {/* Blurred Background */}
      <Image
        src={media.previewUrl}
        alt=""
        aria-hidden="true"
        fill
        className="object-cover blur-2xl scale-110"
      />
      <div className="absolute inset-0 bg-black/50"></div>

      {/* Main Image */}
      <Image
        src={media.url}
        alt="Immich Photo"
        fill
        className="object-contain"
        priority={isCurrent}
      />
    </div>
  );
}
