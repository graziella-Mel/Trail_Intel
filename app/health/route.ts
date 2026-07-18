export function GET(){
  return Response.json({status:"ok",service:"trail-intel",time:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
