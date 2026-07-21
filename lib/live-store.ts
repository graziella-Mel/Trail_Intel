import { processReading, snapshot, type LiveSession, type LocationReading, type RoutePoint } from "./live-hike.ts";
const sessions=new Map<string,LiveSession>();
export function createSession(input:{trailId:string;route:RoutePoint[];predictedHours:number;sunsetHour:number;weather?:LiveSession["weather"]}){const now=new Date().toISOString(),session:LiveSession={id:`live_${crypto.randomUUID()}`,trailId:input.trailId,state:"CREATED",createdAt:now,startedAt:null,pausedAt:null,finishedAt:null,route:input.route,rawReadings:[],filteredReadings:[],predictedHours:input.predictedHours,sunsetHour:input.sunsetHour,weather:input.weather||{apparent:27,rain:15,wind:20,source:"unavailable",updatedAt:now},offRouteSince:null,warnings:[],summary:null};session.summary=snapshot(session,new Date(now));sessions.set(session.id,session);return session}
export function getSession(id:string){return sessions.get(id)}
export function transition(session:LiveSession,action:string){const wallClock=new Date().toISOString(),lastReading=session.filteredReadings.filter(reading=>reading.accepted).at(-1)?.timestamp,now=action==="finish"&&lastReading?lastReading:wallClock;if(action==="start"&&session.state==="CREATED"){session.state="ACTIVE";session.startedAt=wallClock}else if(action==="pause"&&session.state==="ACTIVE"){session.state="PAUSED";session.pausedAt=wallClock}else if(action==="resume"&&session.state==="PAUSED"){session.state="ACTIVE";session.pausedAt=null}else if(action==="finish"&&["ACTIVE","PAUSED"].includes(session.state)){session.state="COMPLETED";session.finishedAt=now}else if(action==="cancel"&&!['COMPLETED','CANCELLED'].includes(session.state)){session.state="CANCELLED";session.finishedAt=wallClock}else return null;session.summary=snapshot(session,new Date(now));return session}
export function addLocations(session:LiveSession,readings:LocationReading[]){if(session.state!=="ACTIVE")return null;let result=session.summary;for(const reading of readings)result=processReading(session,{...reading,session_id:session.id});return result}
export function updateWeather(session:LiveSession,weather:LiveSession["weather"]){
  const previousWeather=session.weather,previousSummary=session.summary;
  session.weather=weather;
  const updated=snapshot(session,new Date(weather.updatedAt||Date.now()));
  updated.fatigueScore=previousSummary?.fatigueScore;
  updated.recommendation=previousSummary?.recommendation;
  const apparent=weather.apparent+updated.progressPct*.035;
  updated.weatherSuitability=Math.max(0,Math.round(100-Math.max(0,apparent-28)*8-weather.rain*.35-Math.max(0,weather.wind-25)*1.2));
  const material=Math.abs(weather.apparent-previousWeather.apparent)>=4||Math.abs(weather.rain-previousWeather.rain)>=20||Math.abs(weather.wind-previousWeather.wind)>=15;
  if(material){
    const warning={type:"WEATHER_WINDOW_CHANGED" as const,severity:"medium" as const,title:"Weather Window Changed",message:`Live conditions changed to ${Math.round(weather.apparent)}°C apparent temperature, ${Math.round(weather.rain)}% rain probability, and ${Math.round(weather.wind)} km/h wind.`,evidence:{apparent_c:weather.apparent,rain_probability:weather.rain,wind_kmh:weather.wind},timestamp:weather.updatedAt||new Date().toISOString(),confidence:.85,recommended_action:"Review the updated weather fit and the remaining exposed sections.",affected_trail_segment:null,acknowledgement_required:false};
    session.warnings.push(warning);
    updated.primaryWarning=warning;
  }
  session.summary=updated;
  return session;
}
