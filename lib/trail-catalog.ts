import importedTrails from "../data/generated/imported-trails.json" with { type: "json" };

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
const CORE_TRAILS: TrailCatalogEntry[] = [
  {
    id: "baskinta",
    file: "/baskinta-trail.gpx",
    name: "Baskinta → Zaarour → Mamboukh",
    detail: "Wadi el Deleb · Dahr el Mtein · Majdel Tarchich · Wadi el Amine",
    region: "Mount Lebanon",
    source:
      "https://www.wikiloc.com/hiking-trails/baskinta-wadi-el-deleb-zaarour-dahr-el-mtein-majdel-tarchich-aintoura-wadi-el-amine-mamboukh-134654008",
    latitude: 33.93711,
    longitude: 35.79842,
    distanceKm: 35.7,
    ascentM: 2440,
    highPointM: 1998,
    difficulty: "advanced",
    features: ["viewpoint", "long_distance", "remote"],
    exposure: "high",
    confidence: 96,
    updatedAt: "2026-07-18T00:00:00Z",
    active: true,
  },
  {
    id: "cedars-lake",
    file: "/cedars-lake-part-of-lmt-section-8.gpx",
    name: "Cedars Lake",
    detail: "Part of Lebanon Mountain Trail · Section 8",
    region: "North Lebanon",
    latitude: 34.23621,
    longitude: 36.0433,
    distanceKm: 5.4,
    ascentM: 345,
    highPointM: 2032,
    difficulty: "easy",
    features: ["lake", "viewpoint"],
    exposure: "medium",
    confidence: 90,
    updatedAt: "2026-07-18T00:00:00Z",
    active: true,
  },
  {
    id: "jouar-el-haouz",
    file: "/jouar-el-haouz-falougha-kfarselwan-ponds.gpx",
    name: "Jouar el Haouz → Falougha → Kfarselwan Ponds",
    detail: "Mountain ponds traverse",
    region: "Mount Lebanon",
    latitude: 33.85591,
    longitude: 35.7547,
    distanceKm: 10.8,
    ascentM: 606,
    highPointM: 1752,
    difficulty: "moderate",
    features: ["lake", "viewpoint"],
    exposure: "medium",
    confidence: 92,
    updatedAt: "2026-07-18T00:00:00Z",
    active: true,
  },
  {
    id: "arsoun",
    file: "/arsoun-qorneyel-jouret-arsoun.gpx",
    name: "Arsoun → Qorneyel → Jouret Arsoun",
    detail: "Recorded mountain route",
    region: "Mount Lebanon",
    latitude: 33.8597,
    longitude: 35.68815,
    distanceKm: 10.3,
    ascentM: 573,
    highPointM: 947,
    difficulty: "moderate",
    features: ["forest", "village"],
    exposure: "low",
    confidence: 91,
    updatedAt: "2026-07-18T00:00:00Z",
    active: true,
  },
  {
    id: "barouk",
    file: "/barouk-reserve-entrance-lake-khetyara-tree-massyaf-el-mir-la.gpx",
    name: "Barouk Reserve Entrance → Lake Khetyara",
    detail: "Tree and Massyaf el Mir route",
    region: "Chouf",
    latitude: 33.70523,
    longitude: 35.70235,
    distanceKm: 13,
    ascentM: 760,
    highPointM: 1820,
    difficulty: "moderate",
    features: ["forest", "lake", "viewpoint", "water"],
    exposure: "medium",
    confidence: 94,
    updatedAt: "2026-07-18T00:00:00Z",
    active: true,
  },
  {
    id: "falougha-summit",
    file: "/falougha-kneisseh-summit-kfarselwan.gpx",
    name: "Falougha → Kneisseh Summit → Kfarselwan",
    detail: "Summit traverse",
    region: "Mount Lebanon",
    latitude: 33.84463,
    longitude: 35.75335,
    distanceKm: 12.9,
    ascentM: 746,
    highPointM: 2092,
    difficulty: "advanced",
    features: ["summit", "viewpoint", "high_exposure"],
    exposure: "high",
    confidence: 93,
    updatedAt: "2026-07-18T00:00:00Z",
    active: true,
  },
  {
    id: "ehden",
    file: "/ehden-hmaiss.gpx",
    name: "Ehden → Hmaiss",
    detail: "Recorded mountain route",
    region: "North Lebanon",
    latitude: 34.295,
    longitude: 35.9595,
    distanceKm: 24,
    ascentM: 947,
    highPointM: 2138,
    difficulty: "advanced",
    features: ["forest", "viewpoint", "long_distance"],
    exposure: "medium",
    confidence: 95,
    updatedAt: "2026-07-18T00:00:00Z",
    active: true,
  },
];
export const TRAIL_CATALOG: TrailCatalogEntry[] = [
  ...CORE_TRAILS,
  ...(importedTrails as TrailCatalogEntry[]),
];
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
