/** Standardized seed categories. Slugs are stable IDs; names are bilingual. */

export interface CategorySeed {
  slug: string;
  name_ar: string;
  name_en: string;
}

export const CATEGORY_SEED: CategorySeed[] = [
  { slug: "damascus", name_ar: "دمشق", name_en: "Damascus" },
  { slug: "aleppo", name_ar: "حلب", name_en: "Aleppo" },
  { slug: "homs", name_ar: "حمص", name_en: "Homs" },
  { slug: "latakia", name_ar: "اللاذقية", name_en: "Latakia" },
  { slug: "nature", name_ar: "طبيعة", name_en: "Nature" },
  { slug: "food", name_ar: "طعام", name_en: "Food" },
  { slug: "daily-life", name_ar: "الحياة اليومية", name_en: "Daily Life" },
  {
    slug: "historical-landmarks",
    name_ar: "معالم تاريخية",
    name_en: "Historical Landmarks",
  },
  { slug: "architecture", name_ar: "عمارة", name_en: "Architecture" },
  { slug: "people", name_ar: "أشخاص", name_en: "People" },
];
