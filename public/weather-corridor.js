/* Análise indicativa de mosaico HISTÓRICO RainViewer. Sem extrapolação temporal. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.MotoWeather=api;})(typeof window!=='undefined'?window:undefined,()=>{
 'use strict';
 const R=Math.PI/180,EARTH=6371000,TILE_SIZE=512;
 function meters(a,b){const dl=(b.lat-a.lat)*R,dn=(b.lng-a.lng)*R;const h=Math.sin(dl/2)**2+Math.cos(a.lat*R)*Math.cos(b.lat*R)*Math.sin(dn/2)**2;return 2*EARTH*Math.asin(Math.min(1,Math.sqrt(h)));}
 function toPoint(q){return {lat:+q[1],lng:+q[0]};}
 function sampleForward(coords,origin,opts={}){
   if(!Array.isArray(coords)||coords.length<2||!Number.isFinite(origin?.lat)||!Number.isFinite(origin?.lng))return [];
   const max=Math.min(30000,Math.max(500,Number(opts.metersAhead)||30000));
   const step=Math.min(5000,Math.max(750,Number(opts.stepMeters)||2000));
   const line=coords.map(toPoint),cum=[0];for(let i=1;i<line.length;i++)cum.push(cum[i-1]+meters(line[i-1],line[i]));
   let best=null;
   for(let i=1;i<line.length;i++){
     const a=line[i-1],b=line[i],ref=Math.cos(origin.lat*R);
     const dx=(b.lng-a.lng)*R*EARTH*ref,dy=(b.lat-a.lat)*R*EARTH;
     const px=(origin.lng-a.lng)*R*EARTH*ref,py=(origin.lat-a.lat)*R*EARTH;
     const f=Math.max(0,Math.min(1,(px*dx+py*dy)/Math.max(1,dx*dx+dy*dy)));
     const dist=Math.hypot(px-f*dx,py-f*dy),position=cum[i-1]+(cum[i]-cum[i-1])*f;
     if(!best||dist<best.dist)best={dist,position};
   }
   if(!best||best.dist>200)return [];
   const output=[];
   for(let offset=0;offset<=max && best.position+offset<=cum.at(-1)+1;offset+=step){
     const target=best.position+offset;let i=1;while(i<cum.length-1&&cum[i]<target)i++;
     const f=Math.max(0,Math.min(1,(target-cum[i-1])/Math.max(1,cum[i]-cum[i-1])));
     output.push({lat:line[i-1].lat+(line[i].lat-line[i-1].lat)*f,lng:line[i-1].lng+(line[i].lng-line[i-1].lng)*f,distanceMeters:offset});
   }
   return output;
 }
 function tileFor(p,z=7){
   const lat=Math.max(-85.05112878,Math.min(85.05112878,p.lat)),lng=p.lng;
   const n=2**z,x=(lng+180)/360*n,y=(1-Math.asinh(Math.tan(lat*R))/Math.PI)/2*n;
   return {z,x:Math.floor(x),y:Math.floor(y),px:Math.max(0,Math.min(TILE_SIZE-1,Math.floor((x-Math.floor(x))*TILE_SIZE))),py:Math.max(0,Math.min(TILE_SIZE-1,Math.floor((y-Math.floor(y))*TILE_SIZE)))};
 }
 function radarUrl(host,path,z,x,y){
   try{const url=new URL(host);if(url.protocol!=='https:'||!/(^|\.)rainviewer\.com$/i.test(url.hostname)||!/^\/v2\/radar\/\d+$/.test(path))return null;
     return `${url.origin}${path}/512/${z}/${x}/${y}/2/1_1.png`;
   }catch(_){return null;}
 }
 async function scan(samples,loadTile){
   if(!samples?.length)return {status:'unavailable',reason:'sem-amostras',tested:0};
   const tiles=new Map();let failed=0,tested=0;
   for(const sample of samples.slice(0,90)){
     const t=tileFor(sample),key=`${t.z}/${t.x}/${t.y}`;
     if(!tiles.has(key)){
       if(tiles.size>=12)return {status:'unavailable',reason:'limite-de-tiles',tested};
       tiles.set(key,Promise.resolve().then(()=>loadTile(t)));
     }
     try{const tile=await tiles.get(key);const rgba=tile.getPixel(t.px,t.py);tested++;
       if(Array.isArray(rgba)&&Number(rgba[3])>=70)return {status:'echo',firstDistanceMeters:sample.distanceMeters,tested,failedTiles:failed};
     }catch(_){failed++;}
   }
   return failed?{status:'unavailable',reason:'dados-de-radar-inacessiveis',tested,failedTiles:failed}:{status:'indeterminate',tested,reason:'sem-eco-amostrado-na-resolucao-disponivel'};
 }
 async function loadBrowserTile(url){
   if(typeof Image==='undefined')throw Error('Imagem indisponível');
   return new Promise((resolve,reject)=>{
     const img=new Image();let finished=false;const timer=setTimeout(()=>finish(new Error('Timeout do radar')),9500);
     function finish(err,view){if(finished)return;finished=true;clearTimeout(timer);img.onload=null;img.onerror=null;err?reject(err):resolve(view);}
     img.crossOrigin='anonymous';img.onload=()=>{try{
       const canvas=document.createElement('canvas');canvas.width=TILE_SIZE;canvas.height=TILE_SIZE;
       const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,TILE_SIZE,TILE_SIZE);
       const bytes=ctx.getImageData(0,0,TILE_SIZE,TILE_SIZE).data;
       finish(null,{getPixel:(x,y)=>{const i=(y*TILE_SIZE+x)*4;return [bytes[i],bytes[i+1],bytes[i+2],bytes[i+3]];}});
     }catch(e){finish(e);}};
     img.onerror=()=>finish(new Error('Imagem sem acesso CORS ou indisponível'));
     img.src=url;
   });
 }
 async function analyze(samples,host,path){
   return scan(samples,t=>{const url=radarUrl(host,path,t.z,t.x,t.y);if(!url)throw Error('Origem do radar inválida');return loadBrowserTile(url);});
 }
 return {meters,sampleForward,tileFor,radarUrl,scan,loadBrowserTile,analyze};
});
