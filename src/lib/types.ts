

export interface ImmichAsset {
  id: string;
  ownerId: string;
  type: 'IMAGE' | 'VIDEO';
  isFavorite: boolean;
  duration: string;
  fileCreatedAt: string;
  isTrashed: boolean;
  livePhotoVideoId: string | null;
  localOffsetHours: number;
  projectionType: string | null;
  ratio: number;
  status: string;
  thumbhash: string;
  stack: any[] | null;
  visibility: string;
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

export interface TimelineBucketResponse {
  city: (string | null)[];
  country: (string | null)[];
  duration: (string | null)[];
  id: string[];
  isFavorite: boolean[];
  isImage: boolean[];
  isTrashed: boolean[];
  livePhotoVideoId: (string | null)[];
  localOffsetHours: number[];
  ownerId: string[];
  projectionType: (string | null)[];
  ratio: number[];
  status: string[];
  thumbhash: string[];
  stack: any[]; // Assuming stack can be any type
  visibility: string[];
  fileCreatedAt: string[];
}

export interface TimelineBucket {
  timeBucket: string;
  count: number;
  totalSize: number;
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
