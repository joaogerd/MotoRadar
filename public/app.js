'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const API = 'https://api.rainviewer.com/public/weather-maps.json';
  const MAX_STOPS = 8;
  const RAINVIEWER_COLOR = 2;
  const key = 'motoradar-route-v03';
  // Roteiro turístico definido para a viagem de moto em Brasília (origem = retorno).
  // Coordenadas das atrações publicadas em https://programeviagem.com/roteiros-de-viagem-sugeridos/roteiro-de-viagem-brasilia-e-goias/
  // O endereço do Dok Hotel NÃO é estimado: consultamos o geocodificador e só traçamos a rota se for encontrado.
  const BRASILIA_TOUR = {
    hotel: 'Dok Hotel — ADE Conjunto 16, Lote 35, Águas Claras, Brasília, DF',
    // Coordenada informada por catálogo do hotel: https://www.ehotelsreviews.com/dok-brasilia-hotel-unidade-aguas-claras-1468752-en
    hotelPoint: [-15.877349,-48.013305],
    stops: [
      ['Memorial JK',-15.783530,-47.913720],
      ['Torre de TV de Brasília',-15.791224,-47.894405],
      ['Santuário Dom Bosco',-15.800857,-47.895230],
      ['Catedral Metropolitana de Brasília',-15.797278,-47.875443],
      ['Praça dos Três Poderes',-15.801236,-47.858459],
      // Centro da Ponte JK, para o roteador passar pela via (15°49'25''S, 47°49'46''W).
      ['Ponte JK (passagem)',-15.823611,-47.829444],
      ['Pontão do Lago Sul',-15.826676,-47.873419],
      ['Ermida Dom Bosco',-15.798237,-47.809354]
    ]
  };
  const state = {
    origin: {id:'origin',label:'',point:null,gps:false},
    destination: {id:'destination',label:'',point:null},
    stops:[], map:null, radarHost:'', frames:[], frameIndex:0, radarLayer:null, coverageLayer:null,
    radarVisible:true, coverage:false, opacity:.68, animation:null,
    gpsPoint:null, gpsWatch:null, gpsMarker:null, accuracyCircle:null, follow:false,
    pins:[], routeLayer:null, routeRequest:0, lastRoutePoint:null,
    pickTarget:null, waitingSearch:false, lastSearch:0, searchVersion:0, mapReady:false
  };
  let toastTimeout;
  const pointLabel = (p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const toPoint = (p) => p ? L.latLng(Number(p.lat), Number(p.lng)) : null;
  const unit = (p) => p ? `${p.lat},${p.lng}` : '';
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(message) { const el=$('toast'); el.textContent=message; el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),4800); }
  function persist() {
    try {
      localStorage.setItem(key,JSON.stringify({
        origin:{label:state.origin.gps?'':state.origin.label,point:state.origin.gps?null:state.origin.point},
        destination:{label:state.destination.label,point:state.destination.point},
        stops:state.stops.map(({id,label,point})=>({id,label,point}))
      }));
    } catch(_){}
  }
  function restore() {
    try {
      const s=JSON.parse(localStorage.getItem(key)||'null'); if(!s)return;
      for(const name of ['origin','destination'])if(s[name]){
        state[name].label=String(s[name].label||'').slice(0,160);
        if(Number.isFinite(+s[name].point?.lat)&&Number.isFinite(+s[name].point?.lng))state[name].point=toPoint(s[name].point);
      }
      if(Array.isArray(s.stops))state.stops=s.stops.slice(0,MAX_STOPS).filter(p=>p&&p.id).map(p=>({id:String(p.id),label:String(p.label||'').slice(0,160),point:p.point&&Number.isFinite(+p.point.lat)&&Number.isFinite(+p.point.lng)?toPoint(p.point):null}));
    }catch(e){console.warn('Itinerário salvo inválido',e);}
  }
  function targetFor(id) { return id==='origin'?state.origin:id==='destination'?state.destination:state.stops.find(s=>s.id===id); }
  function targetInput(id) {return id==='origin'?$('originInput'):id==='destination'?$('destinationInput'):document.querySelector(`[data-stop-id="${CSS.escape(id)}"] .stop-input`);}
  function setMinimized(on){$('routePanel').classList.toggle('minimized',on);$('routeToggle').setAttribute('aria-expanded',String(!on));$('routePanel').querySelector('.route-toggle-label').textContent=on?'Editar rota ⌄':'Recolher ⌃';}
  function clearSearch(){++state.searchVersion;$('placeResults').hidden=true;$('placeResults').replaceChildren();}
  function removeOldRoute(){state.routeRequest++;removeRouteLayers();$('routeSummary').hidden=true;$('drawRouteBtn').disabled=false;$('drawRouteBtn').textContent='Mostrar rota no mapa';}
  function renderStops(){const root=$('stopsList');root.replaceChildren();state.stops.forEach((stop,i)=>{
    const row=document.createElement('div');row.className='route-field';row.dataset.stopId=stop.id;
    row.innerHTML=`<span class="field-dot stop-dot"></span><div class="field-main"><label for="stop-${i}">Parada ${i+1}</label><div class="entry"><input class="stop-input" id="stop-${i}" type="search" autocomplete="off" maxlength="160" placeholder="Local da parada"><button class="place-search" type="button" aria-label="Buscar parada ${i+1}">⌕</button></div></div><div class="stop-actions"><button class="reorder-btn" type="button" aria-label="Subir parada" title="Subir" ${i===0?'disabled':''}>↑</button><button class="reorder-btn" type="button" aria-label="Descer parada" title="Descer" ${i===state.stops.length-1?'disabled':''}>↓</button><button class="reorder-btn map-stop" type="button" aria-label="Marcar parada no mapa" title="Marcar no mapa">⌖</button><button class="reorder-btn remove-btn" type="button" aria-label="Remover parada" title="Remover">✕</button></div>`;
    const input=row.querySelector('input');input.value=stop.label;
    input.addEventListener('input',()=>{stop.label=input.value;stop.point=null;persist();removeOldRoute();clearSearch();});
    input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchPlace(stop.id);}});
    row.querySelector('.place-search').onclick=()=>searchPlace(stop.id);
    const btns=row.querySelectorAll('.reorder-btn');btns[0].onclick=()=>moveStop(i,-1);btns[1].onclick=()=>moveStop(i,1);btns[2].onclick=()=>setPick(stop.id);btns[3].onclick=()=>{state.stops.splice(i,1);persist();renderStops();removeOldRoute();clearSearch();};
    root.appendChild(row);
  });}
  function moveStop(i,diff){const j=i+diff;if(j<0||j>=state.stops.length)return;[state.stops[i],state.stops[j]]=[state.stops[j],state.stops[i]];persist();renderStops();removeOldRoute();clearSearch();}
  function addStop(){if(state.stops.length>=MAX_STOPS){toast('Limite de oito paradas para preservar a legibilidade e o serviço gratuito de rotas.');return;}state.stops.push({id:`stop-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,label:'',point:null});renderStops();persist();removeOldRoute();setMinimized(false);}
  function changeText(id,value){const obj=targetFor(id);if(!obj)return;obj.label=value;obj.point=null;if(id==='origin'){obj.gps=false;$('gpsUseBtn').classList.remove('selected');}persist();removeOldRoute();clearSearch();}
  function setPoint(id,point,label){const obj=targetFor(id);if(!obj)return;removeOldRoute();obj.point=toPoint(point);obj.label=(label||pointLabel(obj.point)).slice(0,160);if(id==='origin')obj.gps=false;const input=targetInput(id);if(input)input.value=obj.label;clearSearch();persist();renderPins();state.map.panTo?.(obj.point);toast('Local selecionado. Você pode acrescentar paradas ou mostrar a rota.');}
  function setPick(id){state.pickTarget=id;clearSearch();setMinimized(true);$('pickTip').hidden=false;toast('Toque no ponto do mapa que deseja adicionar à viagem.');}
  function stopPick(){state.pickTarget=null;$('pickTip').hidden=true;}
  function searchResponse(places,target){const results=$('placeResults');results.replaceChildren();results.hidden=false;
    if(!Array.isArray(places)||!places.length){results.innerHTML='<div class="result-empty">Nenhum endereço encontrado. Tente cidade + UF ou marque no mapa.</div>';return;}
    for(const place of places){const lat=Number(place.lat),lng=Number(place.lon);if(!Number.isFinite(lat)||!Number.isFinite(lng))continue;
      const btn=document.createElement('button');btn.type='button';btn.className='result-item';btn.textContent=place.display_name||`${lat}, ${lng}`;
      btn.onclick=()=>setPoint(target,L.latLng(lat,lng),place.display_name||'Local escolhido');results.appendChild(btn);
    }
  }
  async function searchPlace(target){const input=targetInput(target),q=input?.value.trim()||'';if(q.length<3){toast('Digite três caracteres ou mais.');return;}
    if(state.waitingSearch)return;
    const version=++state.searchVersion;state.waitingSearch=true;const results=$('placeResults');results.hidden=false;results.textContent='Procurando endereço…';
    // O servidor Nominatim público permite, no máximo, uma consulta por segundo.
    const gap=Math.max(0,1150-(Date.now()-state.lastSearch));if(gap)await new Promise(r=>setTimeout(r,gap));state.lastSearch=Date.now();
    try{const controller=new AbortController();const t=setTimeout(()=>controller.abort(),11000);let response;
      try{response=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&q='+encodeURIComponent(q),{signal:controller.signal,headers:{Accept:'application/json'}});}finally{clearTimeout(t);}
      if(!response.ok)throw Error('HTTP '+response.status);const places=await response.json();if(version!==state.searchVersion)return;searchResponse(places,target);
    }catch(error){if(version===state.searchVersion){results.hidden=false;results.innerHTML='<div class="result-empty">Serviço de busca indisponível. Você pode marcar o local diretamente no mapa.</div>';}}
    finally{state.waitingSearch=false;}
  }
  async function loadBrasiliaTour() {
    if(state.tourLoading)return;
    state.tourLoading=true;
    clearSearch();stopPick();removeOldRoute();
    const hotel=L.latLng(...BRASILIA_TOUR.hotelPoint);
    state.origin={id:'origin',label:BRASILIA_TOUR.hotel,point:hotel,gps:false};
    state.destination={id:'destination',label:BRASILIA_TOUR.hotel,point:L.latLng(hotel.lat,hotel.lng)};
    state.stops=BRASILIA_TOUR.stops.map(([label,lat,lng],i)=>({id:`brasilia-${i+1}`,label,point:L.latLng(lat,lng)}));
    $('originInput').value=state.origin.label;
    $('destinationInput').value=state.destination.label;
    $('gpsUseBtn').classList.remove('selected');
    renderStops();renderPins();persist();
    const status=$('tourStatus');status.hidden=false;
    status.textContent='Passeio Brasília: oito paradas e retorno ao Dok Hotel. Verifique os acessos antes de sair.';
    try{await drawRoute();}
    finally{state.tourLoading=false;}
  }
  function allPoints(){const arr=[state.origin,...state.stops,state.destination];return arr.map(x=>x.gps?state.gpsPoint:x.point);}
  function isReady(){return allPoints().every(p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng));}
  function renderPins(){if(!state.mapReady)return;for(const m of state.pins)state.map.removeLayer(m);state.pins=[];
    const all=[state.origin,...state.stops,state.destination];all.forEach((obj,i)=>{
      const p=obj.gps?state.gpsPoint:obj.point;if(!p) return;
      const role=i===0?'start':i===all.length-1?'end':'stop';const label=role==='start'?'A':role==='end'?'B':String(i);
      const icon=L.divIcon({className:'',iconSize:[31,31],iconAnchor:[15,31],html:`<div class="route-pin ${role}">${escapeHtml(label)}</div>`});
      const m=L.marker(p,{icon,zIndexOffset:role==='end'?300:150}).addTo(state.map);state.pins.push(m);
    });
  }
  function clearRoute(){removeOldRoute();state.origin={id:'origin',label:'',point:null,gps:false};state.destination={id:'destination',label:'',point:null};state.stops=[];$('originInput').value='';$('destinationInput').value='';$('gpsUseBtn').classList.remove('selected');renderStops();renderPins();stopPick();clearSearch();persist();setMinimized(false);toast('Rota limpa.');}
  function routeBounds(){if(!state.routeLayer)return;const bounds=state.routeLayer.getBounds?.();if(bounds?.isValid?.())state.map.fitBounds(bounds,{paddingTopLeft:[22,200],paddingBottomRight:[22,160],maxZoom:14,animate:true});}
  async function drawRoute(){const pts=allPoints();const absent=pts.findIndex(p=>!p);
    if(absent!==-1){if(absent===0&&state.origin.gps)toast('Autorize a localização GPS ou digite uma origem.');else toast(`Escolha um local válido para ${absent===0?'a saída':absent===pts.length-1?'o destino':'a parada '+absent}.`);setMinimized(false);return;}
    if(pts.length<2)return;
    const serial=++state.routeRequest;const parts=pts.map(p=>`${p.lng},${p.lat}`).join(';');
    const url=`https://router.project-osrm.org/route/v1/driving/${parts}?overview=full&geometries=geojson&steps=false`;
    $('drawRouteBtn').disabled=true;$('drawRouteBtn').textContent='Calculando rota…';
    try {const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),20000);let response;
      try{response=await fetch(url,{signal:ctl.signal});}finally{clearTimeout(timeout);}
      if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(serial!==state.routeRequest)return;
      const route=data.routes?.[0];if(data.code==='NoRoute'||!route?.geometry)throw Error('Sem rota disponível');
      if(state.routeLayer)state.map.removeLayer(state.routeLayer);
      state.routeLayer=L.geoJSON(route.geometry,{style:{color:'#ffffff',weight:10,opacity:.95}}).addTo(state.map);
      const highlight=L.geoJSON(route.geometry,{style:{color:'#1479db',weight:6,opacity:.92}}).addTo(state.map);
      // Os dois traços têm de ser removidos juntos ao recalcular.
      const base=state.routeLayer;
      state.routeLayer={getBounds:()=>base.getBounds(),addTo:()=>{},layers:[base,highlight]};
      const km=(route.distance/1000).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1});
      const mins=Math.round(route.duration/60),duration=mins>=60?`${Math.floor(mins/60)}h ${mins%60}min`:`${mins} min`;
      $('routeInfo').textContent=`${km} km · ${duration}`;
      $('routeDetail').textContent=`${state.stops.length} parada(s) • OSRM (perfil automóvel)`;
      $('routeSummary').hidden=false;setMinimized(true);renderPins();routeBounds();persist();
    }catch(err){if(serial!==state.routeRequest)return;console.warn('Erro no roteamento',err);removeOldRoute();toast('Não foi possível calcular o trajeto por rodovias. Confirme os locais e tente novamente.');setMinimized(false);}
    finally{if(serial===state.routeRequest){$('drawRouteBtn').disabled=false;$('drawRouteBtn').textContent='Mostrar rota no mapa';}}
  }
  function removeRouteLayers(){if(!state.routeLayer)return;for(const l of state.routeLayer.layers||[state.routeLayer])state.map.removeLayer(l);state.routeLayer=null;}
  function openMaps(){if(!isReady()){toast('Defina saída, paradas e destino antes de abrir o Google Maps.');return;}
    if(state.stops.length>3){toast('O Google Maps por link em navegador móvel suporta até três paradas. Para mais, divida sua viagem em trechos; a rota completa continua aqui no MotoRadar.');return;}
    const pts=allPoints();const url=new URL('https://www.google.com/maps/dir/?api=1');url.searchParams.set('api','1');url.searchParams.set('origin',unit(pts[0]));url.searchParams.set('destination',unit(pts.at(-1)));url.searchParams.set('travelmode','driving');
    if(state.stops.length)url.searchParams.set('waypoints',pts.slice(1,-1).map(unit).join('|'));
    window.open(url.toString(),'_blank','noopener');
  }
  function openWaze(){if(!isReady()){toast('Selecione todos os locais da viagem.');return;}
    const next=state.stops[0]?.point||state.destination.point;
    toast(state.stops.length?'O Waze abrirá apenas a primeira parada. Depois, abra o próximo trecho.':'Abrindo o destino no Waze.');
    window.open(`https://waze.com/ul?ll=${encodeURIComponent(unit(next))}&navigate=yes`,'_blank','noopener');
  }
  function openSettings(){ $('settingsPanel').hidden=false; stopRadarAnimation(); }
  function closeSettings(){ $('settingsPanel').hidden=true; }
  function frameTime(epoch){return new Date(epoch*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
  function ageMinutes(epoch){return Math.max(0,Math.round(Date.now()/60000-epoch/60));}
  function refreshRadarBadge(){if(!state.frames.length)return;const frame=state.frames[state.frameIndex];const age=ageMinutes(frame.time);$('radarAge').textContent=`Radar ${frameTime(frame.time)} · ${age} min atrás`;$('radarFrameTime').textContent=frameTime(frame.time);$('radarDot').classList.toggle('old',age>30);$('radarTimeline').value=state.frameIndex;}
  function radarTileUrl(frame){return state.radarHost+frame.path+`/512/{z}/{x}/{y}/${RAINVIEWER_COLOR}/1_1.png`;}
  function displayRadarFrame(i){if(!state.frames.length)return;state.frameIndex=Math.max(0,Math.min(i,state.frames.length-1));if(state.radarLayer)state.map.removeLayer(state.radarLayer);
    state.radarLayer=L.tileLayer(radarTileUrl(state.frames[state.frameIndex]),{tileSize:256,opacity:state.opacity,maxNativeZoom:7,maxZoom:18,attribution:'Radar: <a href="https://www.rainviewer.com/">RainViewer</a>',updateWhenIdle:true});
    if(state.radarVisible)state.radarLayer.addTo(state.map);refreshRadarBadge();
  }
  async function updateRadar(){try{const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),13000);let resp;try{resp=await fetch(API,{signal:ctl.signal,cache:'no-store'});}finally{clearTimeout(timeout);}if(!resp.ok)throw Error(resp.status);
    const obj=await resp.json();if(!obj.host||!obj.radar?.past?.length)throw Error('Sem mosaicos');
    const frames=obj.radar.past.slice(-6);if(frames.at(-1)?.time===state.frames.at(-1)?.time)return;
    stopRadarAnimation();state.radarHost=obj.host.replace(/\/$/,'');state.frames=frames;$('radarTimeline').max=frames.length-1;$('radarTimeline').disabled=false;displayRadarFrame(frames.length-1);$('radarDot').classList.remove('error');
  }catch(err){console.warn('Radar indisponível',err);if(!state.frames.length){$('radarAge').textContent='Radar indisponível';$('radarDot').classList.add('error');}else{$('radarAge').textContent+=' • sem atualização';$('radarDot').classList.add('old');}}
  }
  function stopRadarAnimation(){clearInterval(state.animation);state.animation=null;$('radarPlayBtn').textContent='▶';}
  function toggleRadarAnimation(){if(state.animation){stopRadarAnimation();return;}if(!state.frames.length)return;
    if(state.frameIndex===state.frames.length-1)displayRadarFrame(0);
    $('radarPlayBtn').textContent='Ⅱ';state.animation=setInterval(()=>{if(state.frameIndex===state.frames.length-1){stopRadarAnimation();return;}displayRadarFrame(state.frameIndex+1);},2200);
  }
  function toggleRadar(on){state.radarVisible=on;$('radarVisibleBtn').textContent=on?'Ligado':'Desligado';$('radarVisibleBtn').classList.toggle('on',on);$('radarVisibleBtn').setAttribute('aria-pressed',String(on));if(state.radarLayer){if(on)state.radarLayer.addTo(state.map);else state.map.removeLayer(state.radarLayer);}}
  function toggleCoverage(on){state.coverage=on;$('radarCoverageBtn').textContent=on?'Ligada':'Desligada';$('radarCoverageBtn').classList.toggle('on',on);$('radarCoverageBtn').setAttribute('aria-pressed',String(on));if(state.coverageLayer){state.map.removeLayer(state.coverageLayer);state.coverageLayer=null;}if(on){const host=state.radarHost||'https://tilecache.rainviewer.com';state.coverageLayer=L.tileLayer(host+'/v2/coverage/0/512/{z}/{x}/{y}/0/0_0.png',{tileSize:256,opacity:.32,maxNativeZoom:7,maxZoom:18,attribution:'Cobertura: RainViewer'}).addTo(state.map);}}
  function gpsError(error){const txt=error?.code===1?'Localização negada. Autorize o GPS no navegador ou digite sua origem.':'GPS indisponível. Você pode preencher a origem manualmente.';toast(txt);if(error?.code===1&&state.gpsWatch!==null){navigator.geolocation.clearWatch(state.gpsWatch);state.gpsWatch=null;}}
  function updateGPS(pos){const p=L.latLng(pos.coords.latitude,pos.coords.longitude);state.gpsPoint=p;const accuracy=Math.max(0,Math.round(pos.coords.accuracy||0));
    const icon=L.divIcon({className:'',iconSize:[19,19],iconAnchor:[9,9],html:'<div class="gps-pin"></div>'});
    if(!state.gpsMarker){state.gpsMarker=L.marker(p,{icon,zIndexOffset:700}).addTo(state.map);state.accuracyCircle=L.circle(p,{radius:accuracy,color:'#2c8fff',weight:1,fillOpacity:.07}).addTo(state.map);}
    else{state.gpsMarker.setLatLng(p);state.accuracyCircle.setLatLng(p).setRadius(accuracy);}
    if(state.follow)state.map.setView(p,Math.max(11,state.map.getZoom()),{animate:true});
    if(state.origin.gps){state.origin.point=p;state.origin.label='Sua localização atual';$('originInput').value=state.origin.label;$('gpsUseBtn').classList.add('selected');
      if(state.routeLayer&&(!state.lastRoutePoint||p.distanceTo(state.lastRoutePoint)>3000)){state.lastRoutePoint=p;removeRouteLayers();drawRoute();}
    }
    renderPins();$('gpsFloatingBtn').classList.add('active');
  }
  function enableGPS(useAsOrigin=false){if(useAsOrigin){state.origin.gps=true;state.origin.point=state.gpsPoint;state.origin.label='Sua localização atual';removeOldRoute();$('originInput').value=state.origin.label;$('gpsUseBtn').classList.add('selected');persist();}
    if(!navigator.geolocation){toast('Este navegador não oferece localização. Digite uma origem.');return;}
    if(!window.isSecureContext){toast('Abra a página em HTTPS para usar GPS.');return;}
    state.follow=true;if(state.gpsPoint)state.map.setView(state.gpsPoint,Math.max(12,state.map.getZoom()));
    if(state.gpsWatch===null)state.gpsWatch=navigator.geolocation.watchPosition(updateGPS,gpsError,{enableHighAccuracy:true,timeout:18000,maximumAge:12000});
    if(useAsOrigin&&!state.gpsPoint)toast('Solicitando permissão de localização…');
  }
  function initMap(){state.map=L.map('map',{zoomControl:false,preferCanvas:true}).setView([-15.7942,-47.8822],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(state.map);
    state.mapReady=true;state.map.on('click',e=>{if(state.pickTarget){setPoint(state.pickTarget,e.latlng);stopPick();setMinimized(false);}});
    state.map.on('dragstart',()=>{state.follow=false;});renderPins();
  }
  function initEvents(){ $('settingsBtn').onclick=openSettings;$('radarQuickBtn').onclick=openSettings;$('settingsClose').onclick=closeSettings;
    $('settingsPanel').addEventListener('click',e=>{if(e.target===$('settingsPanel'))closeSettings();});
    $('routeToggle').onclick=()=>setMinimized(!$('routePanel').classList.contains('minimized'));
    $('editRouteBtn').onclick=()=>setMinimized(false);
    for(const [id,input] of [['origin','originInput'],['destination','destinationInput']]){
      $(input).addEventListener('input',e=>changeText(id,e.target.value));
      $(input).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchPlace(id);}});
    }
    document.querySelectorAll('.place-search[data-search]').forEach(btn=>btn.onclick=()=>searchPlace(btn.dataset.search));
    $('gpsUseBtn').onclick=()=>enableGPS(true);$('gpsFloatingBtn').onclick=()=>enableGPS(false);
    $('addStopBtn').onclick=addStop;$('clearBtn').onclick=clearRoute;$('drawRouteBtn').onclick=drawRoute;
    $('brasiliaTourBtn').onclick=loadBrasiliaTour;
    $('mapsBtn').onclick=openMaps;$('wazeBtn').onclick=openWaze;
    document.querySelectorAll('.map-pick[data-pick]').forEach(btn=>btn.onclick=()=>setPick(btn.dataset.pick));$('cancelPickBtn').onclick=()=>{stopPick();setMinimized(false);};
    $('radarVisibleBtn').onclick=()=>toggleRadar(!state.radarVisible);
    $('radarCoverageBtn').onclick=()=>toggleCoverage(!state.coverage);
    $('radarOpacity').oninput=e=>{state.opacity=Number(e.target.value)/100;$('opacityTxt').textContent=e.target.value+'%';state.radarLayer?.setOpacity(state.opacity);};
    $('radarTimeline').oninput=e=>{stopRadarAnimation();displayRadarFrame(Number(e.target.value));};
    $('radarPrevBtn').onclick=()=>{stopRadarAnimation();displayRadarFrame(state.frameIndex-1);};
    $('radarNextBtn').onclick=()=>{stopRadarAnimation();displayRadarFrame(state.frameIndex+1);};
    $('radarPlayBtn').onclick=toggleRadarAnimation;$('radarRefreshBtn').onclick=updateRadar;
  }
  function init(){if(typeof L==='undefined'){toast('O mapa não carregou. Confira sua conexão.');return;}
    restore();initMap();renderStops();$('originInput').value=state.origin.label;$('destinationInput').value=state.destination.label;
    initEvents();updateRadar();setInterval(updateRadar,600000);setInterval(refreshRadarBadge,60000);
    const queryTour=new URLSearchParams(location.search).get('roteiro');
    const hashTour=new URLSearchParams(location.hash.replace(/^#/, '')).get('roteiro');
    if(queryTour==='brasilia'||hashTour==='brasilia')loadBrasiliaTour();
    if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  window.addEventListener('load',init);
})();
