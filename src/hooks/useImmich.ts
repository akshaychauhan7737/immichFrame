
"use client";

import { useCallback, useMemo, useState } from 'react';
import type { ImmichAsset, MediaAsset, TimelineBucket, TimelineBucketResponse } from '@/lib/types';
import { useToast } from './use-toast';
import { LOCAL_STORAGE_DATE_KEY } from './useSlideshow';

// --- Environment-based Configuration ---
const SERVER_URL = process.env.NEXT_PUBLIC_IMMICH_SERVER_URL;
const API_KEY = process.env.NEXT_PUBLIC_IMMICH_API_KEY;
const ASSET_FETCH_PAGE_SIZE = 100;
const API_BASE_URL = '/api/immich';

const FETCH_TIMEOUT = 10000; // 10 seconds
const RETRY_DELAY = 5000;   // 5 seconds

// Helper to transform columnar data into an array of objects
const transformColumnarToObjects = (data: TimelineBucketResponse): ImmichAsset[] => {
    if (!data.id || data.id.length === 0) {
        return [];
    }

    const assets: ImmichAsset[] = [];
    const count = data.id.length;

    for (let i = 0; i < count; i++) {
        const asset: ImmichAsset = {
            id: data.id[i],
            type: data.isImage[i] ? 'IMAGE' : 'VIDEO',
            isFavorite: data.isFavorite[i],
            duration: data.duration[i],
            fileCreatedAt: data.fileCreatedAt[i],
            exifInfo: {
                city: data.city?.[i] || undefined,
                state: undefined, 
                country: data.country?.[i] || undefined
            },
            ownerId: data.ownerId[i],
            isTrashed: data.isTrashed[i],
            livePhotoVideoId: data.livePhotoVideoId[i],
            localOffsetHours: data.localOffsetHours[i],
            projectionType: data.projectionType[i],
            ratio: data.ratio[i],
            status: data.status[i],
            thumbhash: data.thumbhash[i],
            stack: data.stack[i],
            visibility: data.visibility[i]
        };
        assets.push(asset);
    }
    return assets;
};


export function useImmich() {
    const { toast } = useToast();
    const [urlsToRevoke, setUrlsToRevoke] = useState<string[]>([]);

    const configError = useMemo(() => {
        if (!SERVER_URL) return "Immich Server URL is missing";
        if (!API_KEY) return "Immich API Key is missing";
        return null;
    }, []);

    const fetchTimelineBuckets = useCallback(async (): Promise<TimelineBucket[] | null> => {
        if (configError) {
            console.error("fetchTimelineBuckets aborted due to config error:", configError);
            return null;
        }
        try {
            const bucketsUrl = `${API_BASE_URL}/timeline/buckets?visibility=timeline&withPartners=true&withStacked=true`;
            const bucketsResponse = await fetch(bucketsUrl, {
                method: 'GET',
                headers: { 'x-api-key': API_KEY as string, 'Accept': 'application/json' },
            });
            if (!bucketsResponse.ok) {
                throw new Error(`Failed to fetch timeline buckets: ${bucketsResponse.statusText}`);
            }
            const buckets: TimelineBucket[] = await bucketsResponse.json();
            return buckets;
        } catch (e) {
            console.error("Error fetching timeline buckets:", e);
            return null;
        }
    }, [configError]);

    const fetchAssets = useCallback(async (searchDate?: Date): Promise<ImmichAsset[] | null> => {
        if (configError) {
            console.error("fetchAssets aborted due to config error:", configError);
            return null;
        }

        const getTimeBucket = () => {
            if (searchDate) return searchDate.toISOString();

            const savedDate = localStorage.getItem(LOCAL_STORAGE_DATE_KEY);
            if (savedDate) {
                return savedDate;
            }
            // If no date is saved, use the start of the current day.
            const today = new Date();
            today.setHours(0, 0, 0, 0); 
            return today.toISOString();
        };

        const timeBucket = getTimeBucket();

        try {
            const url = `${API_BASE_URL}/timeline/bucket?timeBucket=${encodeURIComponent(timeBucket)}&visibility=timeline&withPartners=true&withStacked=true`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: { 
                    'x-api-key': API_KEY as string, 
                    'Accept': 'application/json' 
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server responded with ${response.status}: ${errorText}`);
            }
            
            const data: TimelineBucketResponse = await response.json();
            const items = transformColumnarToObjects(data);

            if (items.length === 0 && !searchDate) { // only loop if we are not in a specific search
                console.log("Reached end of timeline, looping back to the beginning.");
                localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
                return await fetchAssets(); // fetch from the start
            }

            return items;
        } catch (e: any) {
            console.error(`Failed to fetch assets from Immich:`, e);
            return null; // Return null on failure
        }
    }, [configError]);

    const findInitialAssets = useCallback(async (): Promise<{ assets: ImmichAsset[], foundDate: Date } | null> => {
        if (configError) {
            return null;
        }
        try {
            const buckets = await fetchTimelineBuckets();

            if (!buckets || buckets.length === 0) {
                return null; // No buckets found
            }

            const latestBucket = buckets[0];
            const dateToTry = new Date(latestBucket.timeBucket);
            console.log(`Found latest bucket, searching for assets in ${dateToTry.toLocaleDateString()}`);

            const assets = await fetchAssets(dateToTry);

            if (assets && assets.length > 0) {
                return { assets, foundDate: dateToTry };
            }

            return null;
        } catch (e) {
            console.error("Error finding initial assets:", e);
            return null;
        }
    }, [configError, fetchAssets, fetchTimelineBuckets]);


    const getAssetUrl = useCallback(async (asset: ImmichAsset, type: 'original' | 'preview'): Promise<string | null> => {
        if (!API_KEY) return null;

        let url: string;
        if (asset.type === 'VIDEO') {
             url = type === 'original' 
                ? `${API_BASE_URL}/assets/${asset.id}/video/playback?c=${encodeURIComponent(asset.thumbhash)}`
                : `${API_BASE_URL}/assets/${asset.id}/thumbnail?size=preview&c=${encodeURIComponent(asset.thumbhash)}`;
        } else { // IMAGE
             url = `${API_BASE_URL}/assets/${asset.id}/thumbnail?size=preview&c=${encodeURIComponent(asset.thumbhash)}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        try {
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'x-api-key': API_KEY },
                signal: controller.signal,
                cache: 'no-store'
            });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`Failed to fetch ${asset.type} (${type}): ${res.statusText}`);
            
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            setUrlsToRevoke(prev => [...prev, blobUrl]);
            return blobUrl;
        } catch (e: any) {
            clearTimeout(timeoutId);
            const message = e.name === 'AbortError' ? 'request timed out' : e.message;
            console.error(`Error fetching asset ${asset.id} (${type}): ${message}`);
            return null;
        }
    }, []);

    const getAssetWithRetry = useCallback(async (asset: ImmichAsset, retries = 1): Promise<MediaAsset | null> => {
        let originalUrl: string | null = null;
        let previewUrl: string | null = null;
        
        if (asset.type === 'IMAGE') {
            previewUrl = await getAssetUrl(asset, 'preview');
            originalUrl = previewUrl; 
        } else { // VIDEO
            [originalUrl, previewUrl] = await Promise.all([
                getAssetUrl(asset, 'original'),
                getAssetUrl(asset, 'preview')
            ]);
        }

        if (originalUrl && previewUrl) {
             return {
                id: asset.id,
                type: asset.type as 'IMAGE' | 'VIDEO',
                url: originalUrl,
                previewUrl: previewUrl,
                asset: asset,
            };
        }
        
        if (retries > 0) {
            toast({
                title: "Retrying Asset Load...",
                description: `Will retry in ${RETRY_DELAY / 1000}s.`,
            });
            await new Promise(res => setTimeout(res, RETRY_DELAY));
            return await getAssetWithRetry(asset, retries - 1);
        }
        
        toast({
            variant: "destructive",
            title: "Asset Load Failed",
            description: `Skipping asset ${asset.id} after multiple attempts.`,
        });
        return null;
    }, [getAssetUrl, toast]);

    const revokeAssetUrls = useCallback((media: MediaAsset) => {
        if (!media) return;
        setTimeout(() => {
            console.log("Revoking blob URLs for asset:", media.id);
            URL.revokeObjectURL(media.url);
            if (media.url !== media.previewUrl) {
                URL.revokeObjectURL(media.previewUrl);
            }
        }, 2000);
    }, []);

    return { fetchAssets, findInitialAssets, getAssetWithRetry, revokeAssetUrls, fetchTimelineBuckets, configError };
}
