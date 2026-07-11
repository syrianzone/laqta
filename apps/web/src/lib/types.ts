export interface PhotoCardData {
  slug: string;
  titleAr: string | null;
  titleEn: string | null;
  blurhash: string | null;
  dominantColor: string | null;
  width: number | null;
  height: number | null;
  likesCount: number;
  thumb: string;
  medium: string;
}

export interface Category {
  slug: string;
  nameAr: string;
  nameEn: string;
}
