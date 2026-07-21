const CACHE="trail-intel-live-v3";
const ROUTES=["arsoun","curated-arz-jaj-lmt-geotrail","barouk","baskinta","cedars-lake","dhour-el-choueir","ehden","falougha-summit","hbaline-ghost-town","jouar-el-haouz","kfardebian-roman-bridge","mount-baker-chain-lakes","point-state-emerald-view","sannine-loop","zaarour-balouh-valley"];
const ASSETS=["/live",...ROUTES.map(id=>`/derived-routes/${id}.json`)];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener("fetch",event=>{if(event.request.method!=="GET")return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)))});
