import { getRecommendation } from "../../../../lib/recommendation-store";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;const item=getRecommendation(decodeURIComponent(id));return item?Response.json(item):Response.json({error:"Recommendation not found or expired"},{status:404})}
