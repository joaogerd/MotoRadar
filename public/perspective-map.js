/* Perspectiva 3D opcional com MapLibre GL JS, preservando o modo 2D Leaflet. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.MotoPerspective=api;})(typeof window!=='undefined'?window:undefined,()=>{
 'use strict';
 const OSM='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
 function geoPoint(p){return {type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{}}]};}
 function createView(engine,container,route,initial,onDrag){
  if(!engine?.Map||!initial||!Array.isArray(route?.coordinates))throw Error('Motor 3D ou rota indisponível');
  const style={version:8,sources:{osm:{type:'raster',tiles:[OSM],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm-base',type:'raster',source:'osm'}]};
  const map=new engine.Map({container,style,center:[initial.lng,initial.lat],zoom:16.4,pitch:55,bearing:0,attributionControl:true});
  let ready=false,latest=initial,latestHeading=0,geometry=route,radarUrlValue='',radarOpacity=.65,bikeMarker=null;
  function addCore(){
    if(ready)return;ready=true;
    map.addSource('route',{type:'geojson',data:geometry});
    map.addLayer({id:'route-casing',type:'line',source:'route',paint:{'line-color':'#ffffff','line-width':11,'line-opacity':.98}});
    map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':'#0d6efd','line-width':7,'line-opacity':.98}});
    map.addSource('gps',{type:'geojson',data:geoPoint(latest)});
    // A mesma silhueta de motocicleta é exibida no 3D; fallback pontual sem WebGL/DOM.
    if(typeof engine.Marker==='function'&&typeof document!=='undefined'){
      const element=document.createElement('div');
      element.className='gps-vehicle';
      element.setAttribute('aria-label','Minha moto');
      element.innerHTML='<svg class="gps-bike" viewBox="0 0 48 52" aria-hidden="true"><ellipse class="bike-tire" cx="24" cy="7" rx="5" ry="6"/><path class="bike-handlebar" d="M10 19H38"/><circle class="bike-mirror" cx="8" cy="19" r="3.5"/><circle class="bike-mirror" cx="40" cy="19" r="3.5"/><path class="bike-body" d="M19 22h10l5 12-5 12H19l-5-12z"/><circle class="bike-helmet" cx="24" cy="18" r="8"/><path class="bike-visor" d="M19 17q5-4 10 0"/><ellipse class="bike-tire" cx="24" cy="47" rx="5" ry="4"/><path class="bike-tail" d="M19 39h10"/></svg>';
      try{bikeMarker=new engine.Marker({element,anchor:'center',rotationAlignment:'viewport'}).setLngLat([latest.lng,latest.lat]).addTo(map);}
      catch(_){bikeMarker=null;}
    }
    if(!bikeMarker)map.addLayer({id:'gps-marker',type:'circle',source:'gps',paint:{'circle-radius':10,'circle-color':'#267cea','circle-stroke-width':3,'circle-stroke-color':'#fff'}});
    if(radarUrlValue)applyRadar();
  }
  function applyRadar(){if(!ready)return;
    if(map.getLayer?.('radar-mosaic'))map.removeLayer('radar-mosaic');
    if(map.getSource?.('radar'))map.removeSource('radar');
    if(!radarUrlValue||radarOpacity<=0)return;
    map.addSource('radar',{type:'raster',tiles:[radarUrlValue],tileSize:256,maxzoom:7,attribution:'Radar © RainViewer'});
    map.addLayer({id:'radar-mosaic',type:'raster',source:'radar',paint:{'raster-opacity':radarOpacity}});
  }
  map.on('load',addCore);
  if(typeof onDrag==='function')map.on('dragstart',onDrag);
  function update(point,heading=latestHeading,focusY=null){
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
    latest=point;if(Number.isFinite(heading))latestHeading=heading;
    if(!ready)return;
    map.getSource?.('gps')?.setData?.(geoPoint(latest));
    bikeMarker?.setLngLat?.([latest.lng,latest.lat]);
    const height=map.getContainer?.()?.clientHeight||700;
    const offset=Number.isFinite(focusY)?focusY-height/2:Math.min(160,Math.max(55,height*.16));
    map.easeTo({center:[latest.lng,latest.lat],bearing:latestHeading,pitch:55,zoom:16.4,offset:[0,offset],duration:450,essential:true});
  }
  function setRoute(next){if(!Array.isArray(next?.coordinates))return;geometry=next;if(ready)map.getSource?.('route')?.setData?.(geometry);}
  function setRadar(url,opacity=.65){radarUrlValue=url||'';radarOpacity=Math.max(0,Math.min(1,Number(opacity)||0));applyRadar();}
  function destroy(){bikeMarker?.remove?.();map.remove();}
  return {update,setRoute,setRadar,destroy};
 }
 return {createView};
});
