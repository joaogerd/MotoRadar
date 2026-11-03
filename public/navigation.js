/* MotoRadar: navegador experimental em primeiro plano. Sem dependências externas. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MotoNavigation = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';
  const R = Math.PI / 180;
  const EARTH = 6371000;
  const safe = (v, d=0) => Number.isFinite(Number(v)) ? Number(v) : d;
  function meters(a,b) {
    const dLat=(b.lat-a.lat)*R, dLng=(b.lng-a.lng)*R;
    const h=Math.sin(dLat/2)**2 + Math.cos(a.lat*R)*Math.cos(b.lat*R)*Math.sin(dLng/2)**2;
    return 2*EARTH*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
  }
  function fmt(m) {
    if (m>=1000) return `${(m/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} km`;
    return `${Math.max(0, Math.round(m/10)*10)} m`;
  }
  const right = ['right','slight right','sharp right'];
  const left = ['left','slight left','sharp left'];
  function dir(mod) {
    return right.includes(mod) ? 'à direita' : left.includes(mod) ? 'à esquerda' :
      mod==='uturn' ? 'para retornar' : 'em frente';
  }
  function iconFor(step) {
    const man=step?.maneuver||{}, mod=man.modifier;
    if(man.type==='arrive')return '⚑';
    if(['roundabout','rotary','roundabout turn'].includes(man.type))return '⟳';
    if(mod==='uturn')return '↶';
    if(right.includes(mod))return '↱';
    if(left.includes(mod))return '↰';
    return '↑';
  }
  function instructionFor(step, stopName) {
    const m=step?.maneuver||{}, type=m.type||'continue';
    const street=String(step?.name||'').trim();
    const onto=street ? ` na ${street}` : '';
    if(type==='arrive')return stopName ? `Você chegou a ${stopName}` : 'Você chegou ao destino';
    if(type==='depart')return `Siga${onto || ' em frente'}`;
    if(['roundabout','rotary','roundabout turn'].includes(type)) {
      const exit=Number(m.exit);
      return `Entre na rotatória${exit>0?` e pegue a ${exit}ª saída`:''}${onto}`;
    }
    if(['merge','on ramp','off ramp'].includes(type))return `Pegue o acesso ${dir(m.modifier)}${onto}`;
    if(type==='fork')return `Mantenha-se ${dir(m.modifier)}${onto}`;
    if(type==='end of road')return `No fim da via, vire ${dir(m.modifier)}${onto}`;
    if(m.modifier==='uturn')return `Faça o retorno${onto}`;
    if(right.includes(m.modifier)||left.includes(m.modifier))return `Vire ${dir(m.modifier)}${onto}`;
    return `Continue${onto || ' em frente'}`;
  }
  function projection(pt,coords,prevMeters=0) {
    let accum=0,best=null;
    const refLat=pt.lat*R;
    for(let i=1;i<coords.length;i++) {
      const a=coords[i-1],b=coords[i];
      const p1={lat:+a[1],lng:+a[0]},p2={lat:+b[1],lng:+b[0]};
      const len=meters(p1,p2);
      const x=(p2.lng-p1.lng)*R*EARTH*Math.cos(refLat),y=(p2.lat-p1.lat)*R*EARTH;
      const qx=(pt.lng-p1.lng)*R*EARTH*Math.cos(refLat),qy=(pt.lat-p1.lat)*R*EARTH;
      const fraction=Math.max(0,Math.min(1, (qx*x+qy*y)/Math.max(1,x*x+y*y)));
      const d=Math.hypot(qx-x*fraction,qy-y*fraction);
      const progress=accum+len*fraction;
      // Prefer a nearby forward segment on overlapping round trips.
      const penalty=progress+90<prevMeters ? 250+Math.min(1500,prevMeters-progress) : 0;
      const candidate={lateralMeters:d,progressMeters:progress,score:d+penalty};
      if(!best || candidate.score<best.score)best=candidate;
      accum+=len;
    }
    return {...best,totalGeometryMeters:accum};
  }
  function createSession(route,stopNames=[]) {
    if(!Array.isArray(route?.geometry?.coordinates)||route.geometry.coordinates.length<2 || !Array.isArray(route.legs))throw new Error('Rota com manobras inválida');
    const coords=route.geometry.coordinates;
    const routeMeters=Math.max(1,safe(route.distance,1));
    const maneuvers=[],legEnds=[];
    let distance=0;
    for(let li=0;li<route.legs.length;li++) {
      const leg=route.legs[li];
      for (const step of leg.steps||[]) {
        const m=step.maneuver||{};
        if(m.type==='arrive') {
          const item={step,at:distance,index:maneuvers.length,leg:li,label:stopNames[li]||`Parada ${li+1}`};
          legEnds.push(item);
          maneuvers.push(item);
        } else if(!['depart','new name','notification'].includes(m.type)) {
          maneuvers.push({step,at:distance,index:maneuvers.length,leg:li});
        }
        distance+=Math.max(0,safe(step.distance));
      }
    }
    // Prefer leg distances over summed steps when the provider excludes short segments.
    const totalM=Math.max(1,safe(route.distance,distance));
    let progress=0, offCount=0, lastReroute=-Infinity, passedStops=0, lastPrompt='', ended=false;
    function update(point,now=Date.now()) {
      const accuracy=safe(point.accuracy,999);
      const lowAccuracy=accuracy>100 || !Number.isFinite(point.lat) || !Number.isFinite(point.lng);
      if(lowAccuracy)return {lowAccuracy:true,reroute:false,finished:false,passedStops,remainingMeters:Math.max(0,totalM-progress),maneuverMeters:0,instruction:'Aguardando GPS preciso',icon:'◎',speak:[]};
      const match=projection(point,coords,progress*Math.max(1,projection(point,coords,0).totalGeometryMeters)/totalM);
      const along=Math.min(totalM,match.progressMeters*totalM/Math.max(1,match.totalGeometryMeters));
      if(match.lateralMeters <= Math.max(65,accuracy*2.5))progress=Math.max(progress,along);
      const offRoute=match.lateralMeters>Math.max(90,accuracy*2.7);
      offCount=offRoute?offCount+1:0;
      let reroute=false;
      if(offCount>=3 && now-lastReroute>90000) { reroute=true;offCount=0;lastReroute=now; }
      while(passedStops<legEnds.length-1 && progress>=legEnds[passedStops].at-28)passedStops++;
      const destination=coords.at(-1);
      if(legEnds.length && progress>=totalM-45 && meters(point,{lat:+destination[1],lng:+destination[0]})<=65) ended=true;
      const next=maneuvers.find(m=>m.at>=progress-18 && (m.step.maneuver.type!=='arrive'||m.leg>=passedStops))||maneuvers.at(-1);
      const maneuverMeters=next?Math.max(0,next.at-progress):Math.max(0,totalM-progress);
      const instruction=next?instructionFor(next.step,next.label):'Siga a rota';
      const speak=[];
      if(next && !ended && !offRoute) {
        const phase=maneuverMeters<=75?'agora':maneuverMeters<=500?'breve':'longe';
        const id=`${next.index}:${phase}`;
        if(id!==lastPrompt && (phase!=='longe'||progress===0)){
          speak.push(phase==='agora'?instruction:`Em ${fmt(maneuverMeters)}, ${instruction.charAt(0).toLowerCase()+instruction.slice(1)}`);
          lastPrompt=id;
        }
      }
      if(ended){if(lastPrompt!=='fim')speak.push('Você chegou ao destino');lastPrompt='fim';}
      return {lowAccuracy:false,offRoute,reroute,finished:ended,passedStops,
        remainingMeters:Math.max(0,totalM-progress),maneuverMeters,instruction,
        icon:next?iconFor(next.step):'↑',distanceFromRoad:Math.round(match.lateralMeters),
        etaSeconds:Math.round(Math.max(0,safe(route.duration))*Math.max(0,totalM-progress)/totalM),speak};
    }
    return {update,get passedStops(){return passedStops;}};
  }
  return {createSession,instructionFor,fmt,meters,projection};
});
