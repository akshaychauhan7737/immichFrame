
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
  // There are more fields, but these are the most relevant for this app.
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
}
