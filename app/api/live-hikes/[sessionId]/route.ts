import { getSession } from "../../../../lib/live-store";
import { snapshot } from "../../../../lib/live-hike";
export async function GET(_request:Request,context:{params:Promise<{sessionId:string}>}){const {sessionId}=await context.params,session=getSession(sessionId);return session?Response.json({...session,summary:session.summary||snapshot(session)}):Response.json({error:"Live session not found"},{status:404})}
