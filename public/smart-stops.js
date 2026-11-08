/* Busca MANUAL de serviços de apoio. Nunca assume horários, abertura ou segurança. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.MotoStops=api;})(typeof window!=='undefined'?window:undefined,()=>{
 'use strict';
 const ENDPOINT='https://overpass-api.de/api/interpreter';
 const TYPES=new Set(['fuel','parking','restaurant','cafe','hospital','pharmacy']);
 const EARTH=6371000,rad=Math.PI/180;
 const checkPoint=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
 function meters(a,b){let dl=(b.lat-a.lat)*rad,dn=(b.lng-a.lng)*rad;let h=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;return 2*EARTH*Math.asin(Math.min(1,Math.sqrt(h)));}
 function buildQuery(point,type='fuel',radius=3000){
   if(!checkPoint(point)||!TYPES.has(type)||!Number.isInteger(radius)||radius<500||radius>5000)throw Error('Consulta de apoio inválida');
   const around=`(around:${radius},${point.lat.toFixed(5)},${point.lng.toFixed(5)})`;
   return `[out:json][timeout:12];(node[amenity=${type}]${around};way[amenity=${type}]${around};);out center 25;`;
 }
 function normalize(result,origin){
   if(!checkPoint(origin)||!Array.isArray(result?.elements))return [];
   const out=[];
   for(const e of result.elements.slice(0,100)){
     const lat=Number(e.lat??e.center?.lat),lng=Number(e.lon??e.center?.lon);
     if(!checkPoint({lat,lng}))continue;
     const name=String(e.tags?.name||e.tags?.brand||'Serviço de apoio').slice(0,100);
     out.push({id:String(e.type||'node')+'/'+String(e.id),name,lat,lng,kind:e.tags?.amenity||'apoio',distanceMeters:meters(origin,{lat,lng})});
   }
   out.sort((a,b)=>a.distanceMeters-b.distanceMeters);return out.slice(0,20);
 }
 function createClient(fetcher=fetch,clock=()=>Date.now()){
   let last=-Infinity;
   async function search(point,type='fuel',radius=3000){
     if(clock()-last<60000)throw Error('Aguarde 60 segundos antes de uma nova consulta.');
     const query=buildQuery(point,type,radius);last=clock();
     const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
     try{const response=await fetcher(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query),signal:ctl.signal});
       if(!response.ok)throw Error(`Serviço indisponível (HTTP ${response.status})`);
       return normalize(await response.json(),point);
     }finally{clearTimeout(timer);}
   }
   return {search};
 }
 return {buildQuery,normalize,createClient};
});
