

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
  exifInfo?: {
    city?: string;
    country?: string;
    exifImageWidth?: number;
    exifImageHeight?: number;
    dateTimeOriginal?: string;
    orientation?: number;
    [key: string]: any;
  }
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
