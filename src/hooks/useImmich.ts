
"use client";

import { useCallback, useMemo, useState } from 'react';
import type { ImmichAsset, MediaAsset } from '@/lib/types';
import { useToast } from './use-toast';
import { LOCAL_STORAGE_DATE_KEY } from './useSlideshow';

// --- Environment-based Configuration ---
const SERVER_URL = process.env.NEXT_PUBLIC_IMMICH_SERVER_URL;
const API_KEY = process.env.NEXT_PUBLIC_IMMICH_API_KEY;
const IS_FAVORITE_ONLY = process.env.NEXT_PUBLIC_IMMICH_IS_FAVORITE_ONLY === 'true';
const IS_ARCHIVED_INCLUDED = process.env.NEXT_PUBLIC_IMMICH_INCLUDE_ARCHIVED === 'true';
const ASSET_FETCH_PAGE_SIZE = 100;
const API_BASE_URL = '/api/immich';

const FETCH_TIMEOUT = 10000; // 10 seconds
const RETRY_DELAY = 5000;   // 5 seconds

export function useImmich() {
    const { toast } = useToast();
    const [urlsToRevoke, setUrlsToRevoke] = useState<string[]>([]);

    const configError = useMemo(() => {
        if (!SERVER_URL) return "Immich Server URL is missing";
        if (!API_KEY) return "Immich API Key is missing";
        return null;
    }, []);

    const fetchAssets = useCallback(async (): Promise<ImmichAsset[] | null> => {
        if (configError) {
            console.error("fetchAssets aborted due to config error:", configError);
            return null;
        }

        const takenBefore = localStorage.getItem(LOCAL_STORAGE_DATE_KEY);

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

            const response = await fetch(`${API_BASE_URL}/search/metadata`, {
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
                throw new Error(`Server responded with ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            const items = data.assets.items || [];

            if (items.length === 0 && takenBefore) {
                console.log("Reached end of timeline, looping back to the beginning.");
                localStorage.removeItem(LOCAL_STORAGE_DATE_KEY);
                // Immediately re-fetch from the start.
                return fetchAssets();
            }

            return items;
        } catch (e: any) {
            console.error(`Failed to fetch assets from Immich:`, e);
            return null; // Return null on failure
        }
    }, [configError]);

    const getAssetUrl = useCallback(async (asset: ImmichAsset, type: 'original' | 'preview'): Promise<string | null> => {
        if (!API_KEY) return null;

        let url: string;
        if (asset.type === 'VIDEO') {
            url = type === 'original' 
                ? `${API_BASE_URL}/assets/${asset.id}/original` 
                : `${API_BASE_URL}/assets/${asset.id}/thumbnail?size=preview`;
        } else { // IMAGE
             url = type === 'original'
                ? `${API_BASE_URL}/assets/${asset.id}/original` 
                : `${API_BASE_URL}/assets/${asset.id}/thumbnail?size=preview`;
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
            setUrlsToRevoke(prev => [...prev, blobUrl]); // Track for later cleanup
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
            originalUrl = previewUrl; // Use preview for both to ensure compatibility
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
        // Delay revocation to ensure transitions complete
        setTimeout(() => {
            console.log("Revoking blob URLs for asset:", media.id);
            URL.revokeObjectURL(media.url);
            URL.revokeObjectURL(media.previewUrl);
        }, 2000);
    }, []);

    return { fetchAssets, getAssetWithRetry, revokeAssetUrls, configError };
}
