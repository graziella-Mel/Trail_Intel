import type { Recommendation } from "./recommendations";
const records = new Map<string, Recommendation>();
export function saveRecommendations(items:Recommendation[]){for(const item of items)records.set(item.recommendationId,item)}
export function getRecommendation(id:string){return records.get(id)}
