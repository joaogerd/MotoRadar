/* Tendência visual HISTÓRICA de ecos: deslocamento bruto, não nowcasting, sem uso na navegação. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.MotoEchoMotion=api;})(typeof window!=='undefined'?window:undefined,()=>{
 'use strict';
 function estimate(previous,current,opts={}){
  const width=Number(opts.width),height=Number(opts.height),time=Number(opts.frameSeconds||600),step=Number(opts.step||1),max=Math.min(12,Math.max(1,Number(opts.maxShift)||7));
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<16||height<16||previous?.length!==width*height||current?.length!==width*height||!Number.isFinite(time)||time<60||time>7200)return {status:'unavailable',reason:'entrada-ou-horario-invalido'};
  let prevCount=0,curCount=0;for(let i=0;i<previous.length;i++){if(previous[i]>=70)prevCount++;if(current[i]>=70)curCount++;}
  if(Math.min(prevCount,curCount)<Math.max(15,Math.round(width*height*.001)))return {status:'unavailable',reason:'ecos-insuficientes'};
  let best={score:-1,dx:0,dy:0,inter:0,union:0};const scores=[];
  for(let dy=-max;dy<=max;dy++)for(let dx=-max;dx<=max;dx++){
   let inter=0,union=0; // mesmo retângulo de comparação, evita favorecer deslocamentos que saem da imagem
   for(let y=max;y<height-max;y++)for(let x=max;x<width-max;x++){
    const a=previous[y*width+x]>=70,b=current[(y+dy)*width+(x+dx)]>=70;
    if(a||b)union++;if(a&&b)inter++;
   }
   if(union<10)continue;
   const score=inter/union;scores.push({score,dx,dy});if(score>best.score)best={score,dx,dy,inter,union};
  }
  if(best.score<.36||best.inter<10)return {status:'unavailable',reason:'correspondencia-fraca'};
  scores.sort((a,b)=>b.score-a.score);
  const runnerUp=scores.find(s=>Math.abs(s.dx-best.dx)+Math.abs(s.dy-best.dy)>=2)?.score??0;
  const confidence=Math.max(0,Math.min(1,best.score));
  if(confidence-runnerUp<.06)return {status:'unavailable',reason:'movimento-ambiguo',confidence};
  const dxPixels=best.dx*step,dyPixels=best.dy*step;
  // zoom7 RainViewer 512px: resolução aproximada em metros por pixel na latitude central.
  const metersPerPixel=156543.03392*Math.cos((Number(opts.latitude)||0)*Math.PI/180)/(2**(Number(opts.zoom)||7))*(256/(Number(opts.tileSize)||512));
  const speedKmH=Math.hypot(dxPixels,dyPixels)*metersPerPixel/time*3.6;
  if(!Number.isFinite(speedKmH)||speedKmH>180)return {status:'unavailable',reason:'deslocamento-inconsistente'};
  return {status:'motion',dxPixels,dyPixels,bearingDeg:(Math.atan2(dxPixels,-dyPixels)*180/Math.PI+360)%360,speedKmH,confidence,reason:'movimento-aparente-historico'};
 }
 function maskFromTile(tile,size=512,step=4){
  const n=Math.floor(size/step),mask=new Uint8Array(n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const rgba=tile.getPixel(x*step+Math.floor(step/2),y*step+Math.floor(step/2));
   mask[y*n+x]=rgba?.[3]||0;
  }
  return {mask,width:n,height:n};
 }
 async function analyzeFrames(point,host,oldFrame,newFrame,weather){
  const dt=(newFrame?.time-oldFrame?.time);
  if(!point||!weather?.tileFor||!weather?.radarUrl||!weather?.loadBrowserTile||!Number.isFinite(dt)||dt<60||dt>3600)return {status:'unavailable',reason:'quadros-ou-tempos-indisponiveis'};
  const t=weather.tileFor(point,7);
  const u0=weather.radarUrl(host,oldFrame.path,t.z,t.x,t.y),u1=weather.radarUrl(host,newFrame.path,t.z,t.x,t.y);
  if(!u0||!u1)return {status:'unavailable',reason:'origem-invalida'};
  try{
   const [a,b]=await Promise.all([weather.loadBrowserTile(u0),weather.loadBrowserTile(u1)]);
   const old=maskFromTile(a),next=maskFromTile(b);
   return estimate(old.mask,next.mask,{width:old.width,height:old.height,step:4,maxShift:9,frameSeconds:dt,latitude:point.lat,zoom:7,tileSize:512});
  }catch(_){return {status:'unavailable',reason:'sem-acesso-pixels-cors'};}
 }
 return {estimate,maskFromTile,analyzeFrames};
});
