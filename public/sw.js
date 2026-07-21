const CACHE="trail-intel-live-v6";
const ROUTES=["arsoun","curated-arz-jaj-lmt-geotrail","barouk","baskinta","cedars-lake","dhour-el-choueir","ehden","falougha-summit","hbaline-ghost-town","jouar-el-haouz","kfardebian-roman-bridge","mount-baker-chain-lakes","new-york-central-park-xtreme","point-state-emerald-view","roosevelt-island-manhattan","sannine-loop","zaarour-balouh-valley"];
const ASSETS=ROUTES.map(id=>`/derived-routes/${id}.json`);
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin||!url.pathname.startsWith("/derived-routes/"))return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}
    return response;
  }).catch(()=>caches.match(event.request)));
});
