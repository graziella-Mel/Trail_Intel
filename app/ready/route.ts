import { TRAIL_CATALOG } from "../../lib/trail-catalog";

export function GET(){
  const ready=TRAIL_CATALOG.length>0&&TRAIL_CATALOG.every(trail=>trail.active&&trail.file&&trail.distanceKm>0);
  return Response.json({status:ready?"ready":"not_ready",checks:{trailCatalogue:ready,trailCount:TRAIL_CATALOG.length,seededFallbacks:true}},{status:ready?200:503,headers:{"Cache-Control":"no-store"}});
}
