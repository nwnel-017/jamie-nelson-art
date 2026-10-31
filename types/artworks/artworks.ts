export type ArtworkData = {
  title: string;
  description: string;
  price: string;
  dimensions: string;
  year?: string;
  medium?: string;
  collection: string;
  artwork_note?: string;
  cover_image?: boolean;
};

export type Artwork = {
  id: string;
  title: string;
  description: string;
  image_path: string;
  sold: boolean;
  price: number;
  created_at: string;
};
