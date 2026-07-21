import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  analyze,
  checksum,
  decimate,
  discoverCuratedMetadata,
  geometrySignature,
  parseGpx,
  validateMetadata,
  type ImportedTrail,
  type TrailImportMetadata,
} from "../lib/trail-import.ts";

const args = process.argv.slice(2);
const value = (name: string, fallback: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const directory = resolve(value("--directory", "data/trails"));
const metadataPath = resolve(value("--metadata", join(directory, "metadata.json")));
const dryRun = args.includes("--dry-run");
const ingestedAt =
  process.env.TRAILSENSE_IMPORT_TIMESTAMP || "2026-07-18T00:00:00Z";

let configuredMetadata: TrailImportMetadata[] = [];
try {
  configuredMetadata = JSON.parse(
    await readFile(metadataPath, "utf8"),
  ) as TrailImportMetadata[];
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code;
  if (code !== "ENOENT") throw error;
}

const files = (await readdir(directory, { withFileTypes: true }))
  .filter(
    (entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".gpx",
  )
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));
const metadataByFile = new Map(
  configuredMetadata.map((item) => [basename(item.file).toLowerCase(), item]),
);
const discovered = discoverCuratedMetadata(files, configuredMetadata);

const seenIds = new Set<string>();
const seenChecksums = new Map<string, string>();
const seenGeometry = new Map<string, string>();
const imports: ImportedTrail[] = [];
const warnings: string[] = [];
const failures: string[] = [];

for (const item of discovered) {
  const errors = validateMetadata(item);
  if (errors.length) {
    failures.push(`${item.file}: ${errors.join(", ")}`);
    continue;
  }
  if (seenIds.has(item.id)) {
    failures.push(`${item.file}: duplicate trail id ${item.id}`);
    continue;
  }
  seenIds.add(item.id);
  try {
    const xml = await readFile(join(directory, basename(item.file)), "utf8");
    const hash = checksum(xml);
    const points = parseGpx(xml);
    const signature = geometrySignature(points);
    if (seenChecksums.has(hash))
      throw new Error(`duplicate file of ${seenChecksums.get(hash)}`);
    if (seenGeometry.has(signature))
      warnings.push(
        `${item.file}: geometrically similar to ${seenGeometry.get(signature)}`,
      );
    seenChecksums.set(hash, item.file);
    seenGeometry.set(signature, item.file);

    const analytics = analyze(points);
    const exposure = item.tags.includes("high_exposure")
      ? "high"
      : item.tags.includes("low_exposure")
        ? "low"
        : "medium";
    const derivedFile = `/derived-routes/${item.id}.json`;
    imports.push({
      id: item.id,
      file: derivedFile,
      name: item.name,
      detail: item.detail,
      region: item.region,
      country: item.country,
      ...(item.source_url ? { source: item.source_url } : {}),
      latitude: points[0].lat,
      longitude: points[0].lon,
      ...analytics,
      features: item.tags,
      exposure,
      confidence:
        item.confidence ?? (metadataByFile.has(item.file.toLowerCase()) ? 90 : 75),
      updatedAt: ingestedAt,
      active: true,
      provenance: {
        sourceType: item.source_type,
        sourcePlatform: item.source_platform,
        sourceUrl: item.source_url,
        sourceAuthor: item.source_author,
        contributionDate: item.contribution_date,
        permissionToUse: item.permission_to_use,
        publicDownloadAllowed: item.public_download_allowed,
        visibility: item.visibility,
        gpxChecksum: hash,
        ingestedAt,
        analyticsVersion: "2026.07",
      },
    });
    if (!dryRun) {
      await mkdir(resolve("public/derived-routes"), { recursive: true });
      await writeFile(
        resolve(`public/derived-routes/${item.id}.json`),
        JSON.stringify({
          analysisVersion: "2026.07",
          sourceDownloadAllowed: false,
          points: decimate(points),
        }),
      );
    }
  } catch (error) {
    failures.push(
      `${item.file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

for (const item of configuredMetadata) {
  if (!files.some((file) => file.toLowerCase() === basename(item.file).toLowerCase()))
    warnings.push(`${item.file}: metadata has no matching GPX file`);
}

if (!dryRun) {
  await mkdir(resolve("data/generated"), { recursive: true });
  await writeFile(
    resolve("data/generated/trail-catalog.json"),
    JSON.stringify(imports, null, 2) + "\n",
  );
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "write",
      discoveredGpxFiles: files.length,
      successes: imports.map((trail) => ({
        id: trail.id,
        distanceKm: trail.distanceKm,
        ascentM: trail.ascentM,
        difficulty: trail.difficulty,
        checksum: trail.provenance.gpxChecksum,
      })),
      warnings,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
