/* Perspectiva 3D opcional com MapLibre GL JS, preservando o modo 2D Leaflet. */
(function(root,factory){const api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(root)root.MotoPerspective=api;})(typeof window!=='undefined'?window:undefined,()=>{
 'use strict';
 const OSM='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
 function geoPoint(p){return {type:'FeatureCollection',features:[{type:'Feature',geometry:{type:'Point',coordinates:[p.lng,p.lat]},properties:{}}]};}
 function createView(engine,container,route,initial,onDrag){
  if(!engine?.Map||!initial||!Array.isArray(route?.coordinates))throw Error('Motor 3D ou rota indisponível');
  const style={version:8,sources:{osm:{type:'raster',tiles:[OSM],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm-base',type:'raster',source:'osm'}]};
  const map=new engine.Map({container,style,center:[initial.lng,initial.lat],zoom:16.4,pitch:55,bearing:0,attributionControl:true});
  let ready=false,latest=initial,latestHeading=0,geometry=route,radarUrlValue='',radarOpacity=.65;
  function addCore(){
    if(ready)return;ready=true;
    map.addSource('route',{type:'geojson',data:geometry});
    map.addLayer({id:'route-line',type:'line',source:'route',paint:{'line-color':'#166fd4','line-width':7,'line-opacity':.96}});
    map.addSource('gps',{type:'geojson',data:geoPoint(latest)});
    map.addLayer({id:'gps-marker',type:'circle',source:'gps',paint:{'circle-radius':10,'circle-color':'#267cea','circle-stroke-width':3,'circle-stroke-color':'#fff'}});
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
  function update(point,heading=latestHeading){
    if(!point||!Number.isFinite(point.lat)||!Number.isFinite(point.lng))return;
    latest=point;if(Number.isFinite(heading))latestHeading=heading;
    if(!ready)return;
    map.getSource?.('gps')?.setData?.(geoPoint(latest));
    const offset=Math.min(160,Math.max(55,(map.getContainer?.()?.clientHeight||700)*.16));
    map.easeTo({center:[latest.lng,latest.lat],bearing:latestHeading,pitch:55,zoom:16.4,offset:[0,offset],duration:450,essential:true});
  }
  function setRoute(next){if(!Array.isArray(next?.coordinates))return;geometry=next;if(ready)map.getSource?.('route')?.setData?.(geometry);}
  function setRadar(url,opacity=.65){radarUrlValue=url||'';radarOpacity=Math.max(0,Math.min(1,Number(opacity)||0));applyRadar();}
  function destroy(){map.remove();}
  return {update,setRoute,setRadar,destroy};
 }
 return {createView};
});
