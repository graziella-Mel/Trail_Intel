import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { analyze, createCuratedMetadata, discoverCuratedMetadata, geometrySignature, parseGpx, validateMetadata } from "../lib/trail-import.ts";

const gpx=`<gpx><trk><trkseg><trkpt lat="33.9" lon="35.5"><ele>100</ele></trkpt><trkpt lat="33.91" lon="35.51"><ele>150</ele></trkpt></trkseg></trk></gpx>`;

test("GPX import calculates route analytics",()=>{const points=parseGpx(gpx),route=analyze(points);assert.equal(points.length,2);assert.ok(route.distanceKm>1);assert.equal(route.ascentM,50)});
test("geometry duplicate signature is stable",()=>assert.equal(geometrySignature(parseGpx(gpx)),geometrySignature(parseGpx(gpx))));
test("metadata rejects routes without explicit permission",()=>assert.ok(validateMetadata({permission_to_use:false,public_download_allowed:false,visibility:"demo-only"}).some(error=>error.includes("permission"))));
test("curated GPX files receive safe public-demo defaults",()=>{const metadata=createCuratedMetadata("Qadisha Valley Loop.gpx");assert.equal(metadata.id,"curated-qadisha-valley-loop");assert.equal(metadata.name,"Qadisha Valley Loop");assert.equal(metadata.permission_to_use,true);assert.equal(metadata.public_download_allowed,false);assert.equal(metadata.visibility,"public");assert.deepEqual(validateMetadata(metadata),[])});
test("directory discovery includes GPX files missing explicit metadata",()=>{const explicit=createCuratedMetadata("known.gpx"),discovered=discoverCuratedMetadata(["new-route.gpx","known.gpx"],[{...explicit,id:"known-id"}]);assert.deepEqual(discovered.map(item=>item.id),["known-id","curated-new-route"])});
test("explicit metadata accepts permission-cleared trails outside Lebanon",()=>{const metadata={...createCuratedMetadata("mount-baker.gpx"),country:"United States",region:"Washington"};assert.deepEqual(validateMetadata(metadata),[])});
test("canonical trail directory contains every GPX and matching metadata",async()=>{const files=(await readdir("data/trails")).filter(file=>file.toLowerCase().endsWith(".gpx")).sort();const metadata=JSON.parse(await readFile("data/trails/metadata.json","utf8")) as {file:string}[];assert.equal(files.length,15);assert.deepEqual(metadata.map(item=>item.file).sort(),files);assert.equal((await readdir("public")).filter(file=>file.toLowerCase().endsWith(".gpx")).length,0)});
