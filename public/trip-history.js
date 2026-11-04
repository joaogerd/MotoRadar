/* Histórico de trajetos local e voluntário; nenhum upload. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.MotoTripHistory=api;})(typeof window!=='undefined'?window:undefined,()=>{
  'use strict';
  const KEY='motoradar-trips-v1',MAX_TRIPS=12,MAX_POINTS=4500,R=6371000;
  const valid=v=>typeof v==='number'&&Number.isFinite(v);
  function meters(a,b){const rad=Math.PI/180,dl=(b.lat-a.lat)*rad,dn=(b.lng-a.lng)*rad;const h=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));}
  const xmlEscape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function createStore(storage){
    let trips=[];let active=null;let persistenceOk=true;let recovered=false;
    try{const value=JSON.parse(storage.getItem(KEY)||'[]');
      trips=(Array.isArray(value)?value:value.trips||[]).filter(t=>Array.isArray(t.points)).slice(0,MAX_TRIPS);
      if(value?.active?.points?.length){trips.unshift({...value.active,endedAt:value.active.points.at(-1).time,interrupted:true});trips=trips.slice(0,MAX_TRIPS);recovered=true;}
    }catch(_){trips=[];}
    function persist(){try{storage.setItem(KEY,JSON.stringify({trips,active}));persistenceOk=true;}catch(_){persistenceOk=false;}return persistenceOk;}
    if(recovered)persist();
    function start(name='Viagem',at=Date.now()){
      if(active)throw Error('Gravação já iniciada');
      const stamp=Number.isFinite(at)?at:Date.now();
      active={id:`trip-${stamp}-${Math.floor(Math.random()*1000000)}`,name:String(name).slice(0,120),startedAt:stamp,endedAt:null,points:[],distanceMeters:0,interrupted:false};
      persist();return active.id;
    }
    function addFix(fix,at=Date.now()){
      if(!active)return false;
      const {lat,lng}=fix||{};const accuracy=Number(fix?.accuracy),t=Number(at);
      if(!valid(lat)||!valid(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!valid(accuracy)||accuracy>50||accuracy<0||!valid(t))return false;
      const point={lat,lng,time:t};
      if(valid(fix.altitude) && Math.abs(fix.altitude)<10000)point.elevation=fix.altitude;
      const prev=active.points.at(-1);
      if(prev){const dt=(t-prev.time)/1000;const d=meters(prev,point);
        if(dt<=0||d>Math.max(110,dt*65))return false; // saltos implausíveis ou tempo regressivo
        if(d<8 && dt<12)return false;
        active.distanceMeters+=d;
      }
      if(active.points.length>=MAX_POINTS)return false;
      active.points.push(point);persist();return true;
    }
    function stop(at=Date.now()){
      if(!active)return null;
      active.endedAt=Math.max(active.startedAt,Number(at)||Date.now());
      const done=active;active=null;
      if(done.points.length){trips.unshift(done);trips=trips.slice(0,MAX_TRIPS);}persist();
      return done;
    }
    function list(){return trips.map(x=>({...x,points:x.points.map(p=>({...p}))}));}
    function erase(id){const prior=trips.length;trips=trips.filter(x=>x.id!==id);if(prior!==trips.length)persist();return prior!==trips.length;}
    function clear(){trips=[];persist();}
    function isRecording(){return !!active;}
    function toGPX(id){const trip=trips.find(x=>x.id===id);if(!trip)throw Error('Viagem não encontrada');
      const pts=trip.points.map(p=>`    <trkpt lat="${p.lat}" lon="${p.lng}">${valid(p.elevation)?`<ele>${p.elevation}</ele>`:''}<time>${new Date(p.time).toISOString()}</time></trkpt>`).join('\n');
      return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="MotoRadar" xmlns="http://www.topografix.com/GPX/1/1">\n  <trk><name>${xmlEscape(trip.name)}</name><trkseg>\n${pts}\n  </trkseg></trk>\n</gpx>`;
    }
    return {start,addFix,stop,list,erase,clear,isRecording,toGPX,persistenceOk:()=>persistenceOk};
  }
  return {createStore,meters,xmlEscape};
});
