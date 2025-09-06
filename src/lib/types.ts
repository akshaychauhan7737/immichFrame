export interface ImmichAsset {
  id: string;
  deviceAssetId: string;
  ownerId: string;
  deviceId: string;
  type: 'IMAGE' | 'VIDEO';
  originalPath: string;
  resizePath: string | null;
  createdAt: string;
  modifiedAt: string;
  isFavorite: boolean;
  mimeType: string | null;
  duration: string; // e.g., "00:00:09.123456"
  isArchived: boolean;
  fileCreatedAt: string;
  exifInfo?: {
    make?: string;
    model?: string;
    exifImageWidth?: number;
    exifImageHeight?: number;
    dateTimeOriginal?: string;
    orientation?: number;
    fNumber?: number;
    focalLength?: number;
    iso?: number;
    exposureTime?: number;
    lensModel?: string;
    city?: string;
    state?: string;
    country?: string;
    [key: string]: any;
  }
}

export interface MediaAsset {
  id: string;
  url: string;
  type: 'IMAGE' | 'VIDEO';
  asset: ImmichAsset;
  previewUrl: string; // For video posters and image previews
}

export interface ImmichAlbum {
  id: string;
  albumName: string;
  description: string;
  ownerId:string;
  createdAt: string;
  updatedAt: string;
  albumThumbnailAssetId: string | null;
  shared: boolean;
  assetCount: number;
  assets: ImmichAsset[];
  startDate: string;
}

export interface AirPollutionData {
    main: {
        aqi: number;
    };
    components: {
        co: number;
        no: number;
        no2: number;
        o3: number;
        so2: number;
        pm2_5: number;
        pm10: number;
        nh3: number;
    };
    dt: number;
}

export interface WeatherData {
  temperature: number;
  feelsLike: number;
  weatherCode: number;
  description: string;
  windSpeed: number;
  humidity: number;
}
