/* Cache voluntário de itinerários já calculados. NÃO faz download antecipado de mapas. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.MotoOffline=api;})(typeof window!=='undefined'?window:undefined,()=>{
 'use strict';
 const KEY='motoradar-last-route-v1',TTL=7*86400000,MAX=950000;
 const fingerprint=pts=>pts.map(p=>Number(p.lat).toFixed(5)+','+Number(p.lng).toFixed(5)).join(';');
 function save(storage,points,route,now=Date.now()){
  if(!Array.isArray(points)||points.length<2||!Array.isArray(route?.geometry?.coordinates)||route.geometry.coordinates.length<2)return false;
  try{const record=JSON.stringify({at:now,fingerprint:fingerprint(points),route});if(record.length>MAX)return false;storage.setItem(KEY,record);return true;}catch(_){return false;}
 }
 function load(storage,points,now=Date.now()){
  try{const obj=JSON.parse(storage.getItem(KEY)||'null');if(!obj||obj.fingerprint!==fingerprint(points)||!Number.isFinite(obj.at)||obj.at>now||now-obj.at>TTL)return null;
   if(!Array.isArray(obj.route?.geometry?.coordinates)||obj.route.geometry.coordinates.length<2)return null;
   return obj.route;
  }catch(_){return null;}
 }
 return {save,load};
});
