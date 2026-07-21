import trails from "../data/generated/trail-catalog.json" with { type: "json" };

export type Difficulty = "easy" | "moderate" | "advanced";
export type HikerProfile = {
  distanceKm: number;
  ascentM: number;
  paceKmh: number;
  packKg: number;
};
export const DEFAULT_HIKER_PROFILE: HikerProfile = {
  distanceKm: 18,
  ascentM: 1200,
  paceKmh: 4.5,
  packKg: 6,
};
export const DEMO_HIKER_PROFILE: HikerProfile = {
  distanceKm: 11,
  ascentM: 550,
  paceKmh: 4.2,
  packKg: 5,
};
export type TrailProvenance = {
  sourceType: string;
  sourcePlatform: string | null;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  contributionDate: string;
  permissionToUse: boolean;
  publicDownloadAllowed: boolean;
  visibility: string;
  gpxChecksum: string;
  ingestedAt: string;
  analyticsVersion: string;
};
export type TrailCatalogEntry = {
  id: string;
  file: string;
  name: string;
  detail: string;
  region: string;
  country?: string;
  source?: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  ascentM: number;
  highPointM: number;
  difficulty: Difficulty;
  features: string[];
  exposure: "low" | "medium" | "high";
  confidence: number;
  updatedAt: string;
  active: boolean;
  provenance?: TrailProvenance;
};

export const TRAIL_CATALOG = trails as TrailCatalogEntry[];

export function estimateBaselineHours(
  trail: Pick<TrailCatalogEntry, "distanceKm" | "ascentM">,
  profile: HikerProfile = DEFAULT_HIKER_PROFILE,
) {
  return (
    trail.distanceKm / profile.paceKmh +
    trail.ascentM / 600 +
    0.75 +
    profile.packKg * 0.025
  );
}
