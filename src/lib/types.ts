
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
  duration: string | null;
  isArchived: boolean;
  exifInfo?: {
    city?: string;
    country?: string;
    imageWidth?: number;
    imageHeight?: number;
    [key: string]: any;
  }
}

export interface ImmichAlbum {
  id: string;
  albumName: string;
  description: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  albumThumbnailAssetId: string | null;
  shared: boolean;
  assetCount: number;
  assets: ImmichAsset[];
  startDate: string;
}

    