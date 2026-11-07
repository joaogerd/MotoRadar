'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const API = 'https://api.rainviewer.com/public/weather-maps.json';
  const MAX_STOPS = 8;
  const RAINVIEWER_COLOR = 2;
  const key = 'motoradar-route-v03';
  const NAV_VIEW_KEY = 'motoradar-navigation-view-v1';
  const NAV_ZOOM = 17;
  const GPS_READY_MAX_AGE_MS = 60000;
  const GPS_RETRY_INTERVAL_MS = 16000;
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
    pins:[], routeLayer:null, routeData:null, routeRequest:0, lastRoutePoint:null, routingLastAt:0,
    nav:{active:false,waiting:false,building:false,gpsRequestPending:false,gpsRequestSerial:0,lastGpsAttemptAt:0,gpsPermissionDenied:false,fullscreenOwned:false,goals:[],session:null,requestId:0,muted:false,lastFixAt:0,lowAccuracy:false,wakeLock:null,ownsGpsWatch:false,previewRoute:null,latestPosition:null,cameraPrevious:null,cameraHeading:null,cameraFrames:0},
    pickTarget:null, waitingSearch:false, lastSearch:0, searchVersion:0, mapReady:false
  };
  let toastTimeout;
  let historyRecorder=null;
  let stopsClient=null;
  let perspective=null,perspectiveEnginePromise=null,pseudo3d=false,navigationViewPreference='2.5d';
  const weatherMonitor={scanning:false,lastScanAt:0,lastVoiceAt:0,optedIn:false,lastMessage:''};
  const pointLabel = (p) => `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const toPoint = (p) => p ? L.latLng(Number(p.lat), Number(p.lng)) : null;
  const unit = (p) => p ? `${p.lat},${p.lng}` : '';
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const svgIcon = (name, cls='') => `<svg class=\"icon ${cls}\" aria-hidden=\"true\"><use href=\"#mr-${name}\"></use></svg>`;
  const navIconName = (symbol) => ({'⚑':'flag-solid','⟳':'turn-roundabout-solid','↶':'turn-uturn-solid','↱':'turn-right-solid','↰':'turn-left-solid','↑':'turn-straight-solid','◎':'target-solid'}[symbol] || 'turn-straight-solid');
  function restoreNavigationViewPreference(){
    try {
      const saved=localStorage.getItem(NAV_VIEW_KEY);
      if(saved==='2d'||saved==='2.5d')navigationViewPreference=saved;
    }catch(_){}
    const input=$('navigationViewPreference');
    if(input)input.value=navigationViewPreference;
  }
  function saveNavigationViewPreference(value){
    if(value!=='2d'&&value!=='2.5d')return;
    navigationViewPreference=value;
    const input=$('navigationViewPreference');
    if(input)input.value=value;
    try{localStorage.setItem(NAV_VIEW_KEY,value);}catch(_){}
  }
  function setVoiceButton(){ const btn=$('navigationVoiceBtn'); if(!btn) return; btn.innerHTML=svgIcon(state.nav.muted?'voice-muted-solid':'voice-solid','icon-md')+'<span class="action-label">Voz</span>'; btn.setAttribute('aria-pressed', String(!state.nav.muted)); }
  function toast(message) {
    const duringNavigation=(state.nav.active||state.nav.waiting)&&!$('tripDashboard').hidden;
    const el=duringNavigation?$('tripNotice'):$('toast');
    const other=duringNavigation?$('toast'):$('tripNotice');
    other?.classList.remove('show');
    if(other?.id==='tripNotice')other.hidden=true;
    clearTimeout(toastTimeout);
    el.textContent=message;
    if(duringNavigation)el.hidden=false;
    else el.classList.add('show');
    toastTimeout=setTimeout(()=>{el.classList.remove('show');if(el.id==='tripNotice')el.hidden=true;},4700);
  }
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
  function setMinimized(on){$('routePanel').classList.toggle('minimized',on);$('routeToggle').setAttribute('aria-expanded',String(!on));const label=$('routePanel').querySelector('.route-toggle-label');label.innerHTML=on?`Editar rota ${svgIcon('chevron-down','icon-xs')}`:`Recolher ${svgIcon('chevron-up','icon-xs')}`;}
  function clearSearch(){++state.searchVersion;$('placeResults').hidden=true;$('placeResults').replaceChildren();}
  function removeOldRoute(){if(state.nav.active||state.nav.waiting)stopNavigation();state.routeRequest++;removeRouteLayers();state.routeData=null;$('routeSummary').hidden=true;$('drawRouteBtn').disabled=false;$('drawRouteBtn').textContent='Mostrar rota no mapa';}
  function renderStops(){const root=$('stopsList');root.replaceChildren();state.stops.forEach((stop,i)=>{
    const row=document.createElement('div');row.className='route-field';row.dataset.stopId=stop.id;
    row.innerHTML=`<span class="field-dot stop-dot"></span><div class="field-main"><label for="stop-${i}">Parada ${i+1}</label><div class="entry"><input class="stop-input" id="stop-${i}" type="search" autocomplete="off" maxlength="160" placeholder="Local da parada"><button class="place-search icon-btn" type="button" aria-label="Buscar parada ${i+1}">${svgIcon('search','icon-sm')}</button></div></div><div class="stop-actions"><button class="reorder-btn icon-btn" type="button" aria-label="Subir parada" title="Subir" ${i===0?'disabled':''}>${svgIcon('arrow-up')}</button><button class="reorder-btn icon-btn" type="button" aria-label="Descer parada" title="Descer" ${i===state.stops.length-1?'disabled':''}>${svgIcon('arrow-down')}</button><button class="reorder-btn map-stop icon-btn" type="button" aria-label="Marcar parada no mapa" title="Marcar no mapa">${svgIcon('pin')}</button><button class="reorder-btn remove-btn icon-btn" type="button" aria-label="Remover parada" title="Remover">${svgIcon('close')}</button></div>`;
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
    const serial=++state.routeRequest;
    $('drawRouteBtn').disabled=true;$('drawRouteBtn').textContent='Calculando rota…';
    try {const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),20000);let response;
      try{response=await requestRoute(pts,ctl.signal);}finally{clearTimeout(timeout);}
      const data=response;if(serial!==state.routeRequest)return;
      const route=data.routes?.[0];if(data.code==='NoRoute'||!route?.geometry)throw Error('Sem rota disponível');
      showRoute(route);
      try{window.MotoOffline?.save(localStorage,pts,route);}catch(_){}
      const km=(route.distance/1000).toLocaleString('pt-BR',{maximumFractionDigits:1,minimumFractionDigits:1});
      const mins=Math.round(route.duration/60),duration=mins>=60?`${Math.floor(mins/60)}h ${mins%60}min`:`${mins} min`;
      $('routeInfo').textContent=`${km} km · ${duration}`;
      $('routeDetail').textContent=`${state.stops.length} parada(s) • OSRM (perfil automóvel)`;
      $('routeSummary').hidden=false;setMinimized(true);renderPins();routeBounds();persist();
    }catch(err){if(serial!==state.routeRequest)return;console.warn('Erro no roteamento',err);
      let cached=null;try{cached=window.MotoOffline?.load(localStorage,pts);}catch(_){}
      if(cached){showRoute(cached);$('routeInfo').textContent=`${(cached.distance/1000).toFixed(1)} km · itinerário salvo`;
        $('routeDetail').textContent='Rota anterior (até 7 dias) • mapa e navegação precisam de internet';
        $('routeSummary').hidden=false;setMinimized(true);renderPins();routeBounds();
        toast('Sem acesso ao roteador. Exibindo rota previamente calculada: confirme se vias e acessos permanecem válidos.');
      }else{removeOldRoute();toast('Sem acesso ao roteador. Não há rota salva para estes pontos.');setMinimized(false);}
    }
    finally{if(serial===state.routeRequest){$('drawRouteBtn').disabled=false;$('drawRouteBtn').textContent='Mostrar rota no mapa';}}
  }
  function removeRouteLayers(){if(!state.routeLayer)return;for(const l of state.routeLayer.layers||[state.routeLayer])state.map.removeLayer(l);state.routeLayer=null;}
  function showRoute(route){
    removeRouteLayers();state.routeData=route;perspective?.setRoute(route.geometry);
    const base=L.geoJSON(route.geometry,{style:{color:'#ffffff',weight:10,opacity:.95}}).addTo(state.map);
    const front=L.geoJSON(route.geometry,{style:{color:'#0d6efd',weight:7,opacity:.95}}).addTo(state.map);
    state.routeLayer={getBounds:()=>base.getBounds(),layers:[base,front]};
  }
  // O servidor público OSRM é para demonstração: jamais consultar mais de uma vez por segundo.
  async function requestRoute(points,signal){
    const gap=Math.max(0,1300-(Date.now()-state.routingLastAt));
    if(gap)await new Promise((resolve,reject)=>{const t=setTimeout(resolve,gap);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(new DOMException('Cancelado','AbortError'));},{once:true});});
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    state.routingLastAt=Date.now();
    const parts=points.map(p=>`${p.lng},${p.lat}`).join(';');
    const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${parts}?overview=full&geometries=geojson&steps=true`,{signal});
    if(!response.ok)throw Error('Roteador HTTP '+response.status);
    const result=await response.json();
    if((result.code && result.code!=='Ok')||!result.routes?.[0]?.geometry)throw Error('Rota não disponível');
    return result;
  }
  function navigationStatus(text){$('navigationInstruction').textContent=text;}
  function voice(text){
    if(state.nav.muted || !text || !('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined')return;
    try{const u=new SpeechSynthesisUtterance(text);u.lang='pt-BR';u.rate=1.02;u.volume=1;
      speechSynthesis.cancel();speechSynthesis.speak(u);
    }catch(e){console.warn('Síntese de voz indisponível',e);}
  }
  async function keepAwake(){
    if(!navigator.wakeLock||state.nav.wakeLock||document.visibilityState==='hidden')return;
    try{state.nav.wakeLock=await navigator.wakeLock.request('screen');}catch(_){/* recurso opcional */}
  }
  function releaseWakeLock(){try{state.nav.wakeLock?.release();}catch(_){}state.nav.wakeLock=null;}
  // Só apresentar velocidade quando o GPS fornece medida válida em m/s.
  // Não estimar velocidade do veículo a partir de pontos espaciais ruidosos.
  function updateTripSpeed(position){
    const accuracy=Number(position?.coords?.accuracy);
    const measured=position?.coords?.speed;
    const valid=Number.isFinite(accuracy) && accuracy<=100 && measured!==null && Number.isFinite(measured) && measured>=0;
    // speed é fornecido em m/s pela API Geolocation.
    $('tripSpeed').textContent=valid?String(Math.round(position.coords.speed * 3.6)):'—';
    $('tripSpeed').classList.toggle('unavailable',!valid);
  }
  function updateNavDisplay(info){
    $('navigationArrow').innerHTML=svgIcon(navIconName(info.icon||'↑'),'nav-arrow-svg');
    $('navigationInstruction').textContent=info.instruction;
    $('navigationTurn').textContent=info.lowAccuracy?'GPS impreciso':info.offRoute?'Fora da rota':MotoNavigation.fmt(info.maneuverMeters);
    const remaining=MotoNavigation.fmt(info.remainingMeters);
    $('navigationRemaining').textContent=remaining+' restantes';
    $('tripDistance').textContent=remaining;
    const mins=Math.max(0,Math.round(info.etaSeconds/60));
    const readable=mins>=60?`${Math.floor(mins/60)} h ${mins%60} min`:`${mins} min`;
    $('navigationEta').textContent=readable;
    $('tripDuration').textContent=readable;
    $('tripArrival').textContent=info.lowAccuracy?'—':new Date(Date.now()+Math.max(0,info.etaSeconds)*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    const upcoming=state.nav.goals[info.passedStops];
    $('navigationNextStop').textContent=upcoming?upcoming.label:'Destino';
    $('navigationGpsState').textContent=info.lowAccuracy?'GPS de baixa precisão':info.offRoute?'Verificando desvio…':'GPS ativo';
  }
  function endNavigationComplete(){
    voice('Você chegou ao destino');stopNavigation(false);
    toast('Destino alcançado! O planejamento continua disponível.');
  }
  function handleNavPosition(p,position){
    const nav=state.nav;
    if(!nav.active&&!nav.waiting)return;
    nav.lastFixAt=Date.now();
    updateTripSpeed(position);
    const accuracy=Number(position.coords.accuracy||999);
    if(nav.waiting){if(accuracy>100){navigationStatus('GPS impreciso ('+accuracy+' m). Tente centralizar novamente ao ar livre.');$('navigationGpsState').textContent='Precisão GPS insuficiente';return;}beginNavigation(p,position);return;}
    if(nav.building||!nav.session)return;
    const info=nav.session.update({lat:p.lat,lng:p.lng,accuracy,heading:position.coords.heading,speed:position.coords.speed});
    updateNavDisplay(info);
    if(info.finished){endNavigationComplete();return;}
    for(const message of info.speak)voice(message);
    if(info.reroute)rerouteNavigation(p);
  }
  async function beginNavigation(current,initialPosition=null){
    const nav=state.nav;
    if(!nav.waiting||nav.building)return;
    nav.building=true;nav.waiting=false;const id=++nav.requestId;
    // Com uma posição GPS válida, aproximar a câmera já durante o recálculo da rota.
    // A visualização preferida entra automaticamente sem exigir outro toque.
    setNavigationPerspective(navigationViewPreference==='2.5d',false);
    zoomToStartGPS(current);
    navigationStatus('Calculando rota a partir do GPS…');
    try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),23000);let data;
      try{data=await requestRoute([current,...nav.goals.map(x=>x.point)],controller.signal);}
      finally{clearTimeout(timeout);}
      if(id!==nav.requestId)return;
      const route=data.routes[0];
      if(!route.legs?.length)throw Error('Servidor não retornou manobras');
      showRoute(route);nav.session=MotoNavigation.createSession(route,nav.goals.map(g=>g.label));nav.active=true;nav.building=false;
      $('navigationPanel').hidden=false;nav.cameraFrames=0;nav.cameraPrevious=null;nav.cameraHeading=null;setFollow(true);followNavigationCamera(current,initialPosition||nav.latestPosition);
      navigationStatus('Navegação iniciada');voice('Navegação iniciada. Acompanhe o trajeto e mantenha atenção na estrada.');
      handleNavPosition(current,initialPosition||{coords:{accuracy:Math.max(1,state.nav.lastAccuracy||10),heading:null,speed:null}});
    }catch(err){if(id!==nav.requestId)return;console.warn('Não foi possível iniciar navegação',err);
      stopNavigation();toast('Navegação indisponível: confira a conexão e tente novamente com o GPS ativo.');
    }finally{if(id===nav.requestId)nav.building=false;}
  }
  async function rerouteNavigation(current){
    const nav=state.nav;if(!nav.active||nav.building)return;
    nav.building=true;navigationStatus('Recalculando trajeto…');
    const id=++nav.requestId;
    const remaining=nav.goals.slice(nav.session?.passedStops||0);
    if(!remaining.length){endNavigationComplete();return;}
    try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),23000);let result;
      try{result=await requestRoute([current,...remaining.map(x=>x.point)],controller.signal);}finally{clearTimeout(timeout);}
      if(id!==nav.requestId)return;
      const route=result.routes[0];if(!route.legs?.length)throw Error('Manobras indisponíveis');
      showRoute(route);nav.goals=remaining;nav.session=MotoNavigation.createSession(route,remaining.map(x=>x.label));
      voice('Rota recalculada');navigationStatus('Rota recalculada');
    }catch(err){if(id===nav.requestId){console.warn('Recálculo indisponível',err);toast('Sem recálculo. Verifique a estrada e a conexão.');}}
    finally{if(id===nav.requestId)nav.building=false;}
  }
  function isFullscreen(){return !!document.fullscreenElement;}
  function refreshFullscreenButtons(){
    const active=isFullscreen();
    for(const id of ['navigationFullscreenBtn','fullscreenFloatingBtn']){
      const btn=$(id);if(!btn)continue;
      btn.setAttribute('aria-pressed',String(active));
      btn.setAttribute('aria-label',active?'Sair da tela cheia':'Ativar tela cheia');
      btn.title=active?'Sair da tela cheia':'Tela cheia';
      btn.textContent=active?'⤢':'⛶';
    }
    // O Leaflet precisa recalcular o tamanho após a mudança do viewport.
    if(state.mapReady)setTimeout(()=>state.map.invalidateSize?.(),140);
  }
  function enterFullscreen(fromNavigation=false){
    if(isFullscreen()){refreshFullscreenButtons();return;}
    if(typeof document.documentElement.requestFullscreen!=='function'){
      if(!fromNavigation)toast('Tela cheia não disponível neste navegador. Instale o MotoRadar na tela inicial do Android.');
      return;
    }
    // Chamar diretamente no clique; o Fullscreen API exige ativação do usuário.
    try{
      const request=document.documentElement.requestFullscreen({navigationUI:'hide'});
      if(fromNavigation)state.nav.fullscreenOwned=true;
      Promise.resolve(request).catch(()=>{
        if(fromNavigation)state.nav.fullscreenOwned=false;
        if(!fromNavigation)toast('O navegador bloqueou a tela cheia. Abra no Chrome ou instale o aplicativo.');
        refreshFullscreenButtons();
      });
    }catch(error){
      if(fromNavigation)state.nav.fullscreenOwned=false;
      if(!fromNavigation)toast('Tela cheia indisponível neste navegador.');
    }
  }
  function exitFullscreen(){
    if(!isFullscreen())return;
    try{Promise.resolve(document.exitFullscreen()).catch(()=>{});}catch(_){}
  }
  function toggleFullscreen(){if(isFullscreen())exitFullscreen();else enterFullscreen(state.nav.active||state.nav.waiting);}
  // O fix de watchPosition é compartilhado com o botão "Minha localização".
  // Usar o timestamp do aparelho impede iniciar com uma posição antiga
  // apenas porque o navegador acabou de entregar um valor em cache.
  function recentNavigationGPS(maxAgeMs=GPS_READY_MAX_AGE_MS){
    const nav=state.nav,position=nav.latestPosition;
    if(!state.gpsPoint||!position||!nav.lastFixAt||!Number.isFinite(nav.lastAccuracy)||nav.lastAccuracy>100)return null;
    const ageFromCallback=Math.max(0,Date.now()-nav.lastFixAt);
    const deviceTimestamp=Number(position.timestamp);
    const ageFromDevice=Number.isFinite(deviceTimestamp)&&deviceTimestamp>0
      ? Math.max(0,Date.now()-deviceTimestamp) : ageFromCallback;
    if(Math.max(ageFromCallback,ageFromDevice)>maxAgeMs)return null;
    return {point:state.gpsPoint,position};
  }
  function startNavigation(){
    if(state.nav.active||state.nav.waiting)return;
    if(!isReady()||!state.routeData){toast('Primeiro calcule uma rota com saída, paradas e destino.');return;}
    if(typeof MotoNavigation==='undefined'){toast('Módulo de navegação não carregou. Atualize a página.');return;}
    if(!navigator.geolocation||!window.isSecureContext){toast('Navegação exige GPS e acesso HTTPS.');return;}
    const nav=state.nav;
    nav.goals=[...state.stops,state.destination].map(x=>({label:x.label||'Destino',point:x.point}));
    nav.waiting=true;nav.building=false;nav.gpsRequestPending=false;nav.gpsRequestSerial++;nav.lastGpsAttemptAt=0;nav.gpsPermissionDenied=false;nav.session=null;nav.active=false;nav.previewRoute=state.routeData;nav.ownsGpsWatch=state.gpsWatch===null;
    $('navigationPanel').hidden=false;$('tripDashboard').hidden=false;$('routePanel').hidden=true;$('routeSummary').hidden=true;
    // A preferência precisa refletir no mapa já ao tocar em Iniciar, mesmo
    // enquanto esperamos por um primeiro GPS com precisão suficiente.
    setNavigationPerspective(navigationViewPreference==='2.5d',false);
    setTripPanelCompact(false,false);
    $('tripSpeed').textContent='—';$('tripDistance').textContent='—';$('tripArrival').textContent='—';$('tripDuration').textContent='—';
    navigationStatus('Aguardando GPS…');$('navigationTurn').textContent='—';
    $('navigationRemaining').textContent='Rota a calcular';$('navigationEta').textContent='—';
    $('navigationNextStop').textContent='GPS em tempo real';$('navigationGpsState').textContent='Solicitando localização';
    enterFullscreen(true);keepAwake();enableGPS(false);
    // O GPS que já posicionou a moto no mapa serve também para iniciar a viagem.
    // Isso evita exigir um novo movimento/novo callback de watchPosition.
    const cached=recentNavigationGPS();
    if(cached)beginNavigation(cached.point,cached.position);
    else requestFreshNavigationGPS();
  }
  function requestFreshNavigationGPS(){
    const nav=state.nav;
    if(!nav.waiting||nav.gpsRequestPending||nav.gpsPermissionDenied)return;
    if(typeof navigator.geolocation?.getCurrentPosition!=='function'){
      navigationStatus('Aguardando uma nova leitura GPS…');
      return; // O watchPosition existente ainda pode fornecer uma posição.
    }
    nav.gpsRequestPending=true;nav.lastGpsAttemptAt=Date.now();
    const navId=nav.requestId,serial=++nav.gpsRequestSerial;
    navigationStatus('Localizando sua posição…');
    $('navigationGpsState').textContent='Atualizando GPS';
    const complete=(position,error)=>{
      if(serial!==nav.gpsRequestSerial||nav.requestId!==navId)return;
      nav.gpsRequestPending=false;
      if(!nav.waiting)return; // A navegação já começou pelo watchPosition.
      if(position){
        updateGPS(position); // Mesma validação e rota do GPS contínuo.
        return;
      }
      nav.gpsPermissionDenied=error?.code===1;
      const msg=nav.gpsPermissionDenied
        ? 'GPS bloqueado. Autorize a localização nas configurações do navegador.'
        : 'Sem leitura recente do GPS. Tentando novamente; use Centralizar se necessário.';
      navigationStatus(msg);
      $('navigationGpsState').textContent=msg;
    };
    try{
      navigator.geolocation.getCurrentPosition(
        position=>complete(position,null),
        error=>complete(null,error),
        {enableHighAccuracy:true,timeout:12000,maximumAge:30000}
      );
    }catch(error){complete(null,error);}
  }
  // MapLibre v6 usa módulos ES, não possui o bundle global UMD da v5.
  // Evita download/instalação até o usuário pedir a perspectiva 3D.
  async function loadMapLibre(){
    if(window.maplibregl?.Map)return window.maplibregl;
    if(perspectiveEnginePromise)return perspectiveEnginePromise;
    perspectiveEnginePromise=(async()=>{
      const sources=[
        'https://unpkg.com/maplibre-gl@6.16.0/dist',
        'https://cdn.jsdelivr.net/npm/maplibre-gl@6.16.0/dist'
      ];
      let lastError;
      for(const base of sources){
        try {
          const engine=await import(base+'/maplibre-gl.mjs');
          if(typeof engine?.Map!=='function')throw Error('Módulo MapLibre inválido');
          if(!document.querySelector('link[data-motoradar-maplibre]')){
            const css=document.createElement('link');
            css.rel='stylesheet';css.href=base+'/maplibre-gl.css';
            css.dataset.motoradarMaplibre='true';
            document.head.appendChild(css);
          }
          return engine;
        } catch(error) {lastError=error;console.warn('Falha ao carregar MapLibre de '+base,error);}
      }
      const error=new Error('MAPLIBRE_DOWNLOAD_FAILED');
      error.cause=lastError;
      throw error;
    })().catch(error=>{perspectiveEnginePromise=null;throw error;});
    return perspectiveEnginePromise;
  }
  function setNavigationPerspective(enabled,remember=false){
    // Mesmo mapa Leaflet em ambos os modos; rota/radar/GPS permanecem alinhados.
    pseudo3d=!!enabled;
    $('map').classList.toggle('mr-pseudo3d',pseudo3d);
    const button=$('navigation3dBtn');
    button.setAttribute('aria-pressed',String(pseudo3d));
    button.setAttribute('aria-label',pseudo3d?'Voltar ao mapa 2D':'Ativar perspectiva 2,5D');
    button.title=pseudo3d?'Voltar ao mapa 2D para explorar':'Inclinar mapa (2,5D)';
    button.querySelector('.action-label').textContent=pseudo3d?'2D':'2,5D';
    if(remember)saveNavigationViewPreference(pseudo3d?'2.5d':'2d');
  }
  function disablePerspective(){
    setNavigationPerspective(false,false); // Sair da viagem não modifica a preferência.
    if(perspective){try{perspective.destroy();}catch(_){}}perspective=null;
    $('perspectiveMap').hidden=true;
    if(state.nav.active&&state.gpsPoint&&state.follow)followNavigationCamera(state.gpsPoint);
  }
  function togglePerspective(){
    if(!state.nav.active||!state.gpsPoint||!state.routeData?.geometry){
      toast('Inicie a navegação para usar a perspectiva 2,5D.');return;
    }
    // Um toque alterna a visualização e define o padrão das próximas viagens.
    setNavigationPerspective(!pseudo3d,true);
    setFollow(true);
    refreshNavigationCamera();
  }
  function openSupport(){ $('supportPanel').hidden=false;$('supportResults').textContent='Selecione a categoria e pesquise. Não há consulta automática.'; }
  async function searchSupport(){
    const origin=state.gpsPoint||state.origin.point;
    if(!origin){$('supportResults').textContent='Autorize o GPS ou defina a saída antes de pesquisar serviços.';return;}
    if(!stopsClient){$('supportResults').textContent='Serviço de apoio indisponível.';return;}
    const root=$('supportResults');root.textContent='Consultando cadastro colaborativo…';$('supportSearchBtn').disabled=true;
    try{const places=await stopsClient.search(origin,$('supportType').value,3000);root.replaceChildren();
      if(!places.length)root.textContent='Nenhum ponto cadastrado encontrado. Isso não prova ausência de serviços próximos.';
      for(const place of places){const item=document.createElement('div');item.className='support-result';item.setAttribute('role','listitem');
        const label=document.createElement('div');const title=document.createElement('strong');title.textContent=place.name;const detail=document.createElement('small');detail.textContent=`${(place.distanceMeters/1000).toFixed(1)} km em linha reta • ${place.kind}`;label.append(title,detail);
        const btn=document.createElement('button');btn.type='button';btn.textContent='Mapa';btn.onclick=()=>window.open(`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,'_blank','noopener');
        item.append(label,btn);root.appendChild(item);
      }
    }catch(err){root.textContent=String(err?.message||'Serviço indisponível. Tente novamente mais tarde.');}
    finally{$('supportSearchBtn').disabled=false;}
  }
  function setRecordingButton(recording) {
    const button=$('tripRecordBtn');
    if(!button)return;
    button.innerHTML=svgIcon('record-solid','icon-md')+'<span class="action-label">Gravar</span>';
    button.setAttribute('aria-pressed',String(!!recording));
    button.setAttribute('aria-label',recording?'Parar gravação do trajeto':'Iniciar gravação de trajeto');
  }
  function finishRecording(){
    if(historyRecorder?.isRecording()) {
      const done=historyRecorder.stop();setRecordingButton(false);
      if(done?.points.length)toast('Trajeto salvo somente neste aparelho. Abra Histórico para exportar GPX.');
    }
  }
  function toggleRecording(){
    if(!historyRecorder){toast('O armazenamento local não está disponível.');return;}
    if(historyRecorder.isRecording()){finishRecording();return;}
    if(!state.nav.active){toast('Inicie o Modo Viagem antes de gravar o percurso.');return;}
    const label=state.destination.label||'Viagem de moto';
    historyRecorder.start(label);setRecordingButton(true);
    toast('Gravação iniciada voluntariamente. Os dados ficam neste aparelho.');
  }
  function openHistory(){
    const root=$('tripHistoryList');root.replaceChildren();
    const trips=historyRecorder?.list()||[];
    if(!trips.length){const line=document.createElement('p');line.textContent='Nenhuma viagem gravada neste aparelho.';root.appendChild(line);}
    for(const trip of trips){
      const row=document.createElement('div');row.className='trip-history-row';row.setAttribute('role','listitem');
      const title=document.createElement('strong');title.textContent=trip.name||'Viagem';row.appendChild(title);
      const details=document.createElement('small');details.textContent=`${new Date(trip.startedAt).toLocaleString('pt-BR')} • ${(trip.distanceMeters/1000).toFixed(1)} km • ${trip.points.length} posições`;row.appendChild(details);
      const actions=document.createElement('div');actions.className='trip-history-actions';
      const save=document.createElement('button');save.type='button';save.textContent='Exportar GPX';
      save.onclick=()=>{try{const blob=new Blob([historyRecorder.toGPX(trip.id)],{type:'application/gpx+xml'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`motoradar-${trip.startedAt}.gpx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}catch(_){toast('Não foi possível exportar o GPX.');}};
      const erase=document.createElement('button');erase.type='button';erase.textContent='Excluir';erase.onclick=()=>{historyRecorder.erase(trip.id);openHistory();};
      actions.append(save,erase);row.appendChild(actions);root.appendChild(row);
    }
    $('historyPanel').hidden=false;
  }
  function stopNavigation(cancelSpeech=true){
    disablePerspective();finishRecording();
    const nav=state.nav;
    nav.requestId++;nav.gpsRequestSerial++;nav.gpsRequestPending=false;nav.gpsPermissionDenied=false;nav.lastGpsAttemptAt=0;nav.active=false;nav.waiting=false;nav.building=false;nav.session=null;nav.goals=[];
    $('navigationPanel').hidden=true;$('tripDashboard').hidden=true;$('routePanel').hidden=false;
    $('tripNotice').hidden=true;clearTimeout(toastTimeout);
    setTripPanelCompact(false,false);
    if(nav.fullscreenOwned)exitFullscreen();nav.fullscreenOwned=false;
    if(nav.previewRoute)showRoute(nav.previewRoute);
    nav.previewRoute=null;
    $('routeSummary').hidden=!state.routeData;
    releaseWakeLock();if(cancelSpeech)try{speechSynthesis.cancel();}catch(_){}
    if(nav.ownsGpsWatch && !state.origin.gps && state.gpsWatch!==null){
      navigator.geolocation?.clearWatch(state.gpsWatch);state.gpsWatch=null;
      $('gpsFloatingBtn').classList.remove('active');
    }
    nav.ownsGpsWatch=false;setFollow(false);nav.cameraPrevious=null;nav.cameraHeading=null;nav.cameraFrames=0;
    try{state.map.stopHeadingUp?.();state.map.setBearing?.(0);}catch(_){}
  }
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
  async function analyzeRadarAhead(auto=false){
    if(weatherMonitor.scanning)return;
    if(auto && (!weatherMonitor.optedIn||!state.nav.active||Date.now()-weatherMonitor.lastScanAt<300000))return;
    const msg=$('radarAheadStatus');
    const point=state.gpsPoint;
    const frame=state.frames.at(-1);
    if(!point||!state.routeData?.geometry?.coordinates){if(!auto)msg.textContent='Ative o GPS e calcule uma rota antes de analisar o radar.';return;}
    if(!frame||!state.radarHost){msg.textContent='Mosaico de radar indisponível.';return;}
    const age=ageMinutes(frame.time);
    if(age>30){msg.textContent=`Radar desatualizado (${age} min); análise de ecos suspensa.`;return;}
    if(!window.MotoWeather){msg.textContent='Módulo de análise indisponível.';return;}
    const samples=MotoWeather.sampleForward(state.routeData.geometry.coordinates,point,{metersAhead:30000,stepMeters:2000});
    if(!samples.length){msg.textContent='A moto está fora da rota ou não há geometria à frente suficiente para uma análise.';return;}
    weatherMonitor.scanning=true;weatherMonitor.lastScanAt=Date.now();if(!auto)msg.textContent='Amostrando ecos no mosaico histórico…';
    try{const result=await MotoWeather.analyze(samples,state.radarHost,frame.path);
      let message;
      if(result.status==='echo'){
        const km=(result.firstDistanceMeters/1000).toLocaleString('pt-BR',{maximumFractionDigits:1});
        message=`Eco no mosaico histórico, próximo à rota, a cerca de ${km} km da posição. Imagem de ${age} min; sem nowcasting. Reconheça as limitações de cobertura.`;
        if(auto && age<=20 && result.firstDistanceMeters>=1000 && Date.now()-weatherMonitor.lastVoiceAt>=600000){
          weatherMonitor.lastVoiceAt=Date.now();voice(`Atenção: eco de precipitação detectado no mosaico histórico a aproximadamente ${Math.round(result.firstDistanceMeters/1000)} quilômetros ao longo da rota. Verifique as condições.`);
        }
      }else if(result.status==='indeterminate')message=`Nenhum eco amostrado na resolução disponível. Isso NÃO confirma céu limpo ou cobertura do radar. Imagem de ${age} min.`;
      else message='Não foi possível analisar os pixels do radar (acesso, CORS ou limite de tiles). A visualização normal do mosaico permanece disponível.';
      msg.textContent=message;weatherMonitor.lastMessage=result.status==='echo'?` • eco indicativo`:' ';
    }catch(error){msg.textContent='Análise indisponível. Confira a internet e o acesso à imagem do radar.';}
    finally{weatherMonitor.scanning=false;}
  }
  async function analyzeEchoMotion(){
    const el=$('radarMotionStatus');
    const a=state.frames.at(-2),b=state.frames.at(-1);
    const point=state.gpsPoint || state.map?.getCenter?.();
    if(!a||!b||!point||!window.MotoEchoMotion||!window.MotoWeather){el.textContent='São necessários dois quadros de radar e uma posição no mapa.';return;}
    const age=ageMinutes(b.time);
    if(age>30){el.textContent=`Radar com ${age} min de idade: tendência suspensa.`;return;}
    $('radarMotionBtn').disabled=true;el.textContent='Comparando ecos históricos próximos ao centro do mapa…';
    try{const result=await MotoEchoMotion.analyzeFrames(point,state.radarHost,a,b,MotoWeather);
      if(result.status!=='motion'){el.textContent=`Movimento não estimado (${result.reason}). Não indica ausência de chuva.`;return;}
      const compass=['N','NE','L','SE','S','SO','O','NO'][Math.round(result.bearingDeg/45)%8];
      el.textContent=`Deslocamento visual aparente para ${compass}, cerca de ${Math.round(result.speedKmH)} km/h entre quadros históricos. Amostra grosseira (zoom 7); NÃO é nowcasting nem alerta de segurança.`;
    }catch(_){el.textContent='Comparação indisponível; confira acesso CORS ao radar.';}
    finally{$('radarMotionBtn').disabled=false;}
  }
  function openSettings(){ $('settingsPanel').hidden=false; stopRadarAnimation(); }
  function closeSettings(){ $('settingsPanel').hidden=true; }
  function frameTime(epoch){return new Date(epoch*1000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}
  function ageMinutes(epoch){return Math.max(0,Math.round(Date.now()/60000-epoch/60));}
  function refreshRadarBadge(){if(!state.frames.length)return;const frame=state.frames[state.frameIndex];const age=ageMinutes(frame.time);$('radarAge').textContent=`Radar ${frameTime(frame.time)} · ${age} min atrás`;$('tripRadarText').textContent=`Radar ${frameTime(frame.time)} · ${age} min`; $('tripRadarStatus').classList.toggle('stale',age>30);$('radarFrameTime').textContent=frameTime(frame.time);$('radarDot').classList.toggle('old',age>30);$('radarTimeline').value=state.frameIndex;}
  function radarTileUrl(frame){return state.radarHost+frame.path+`/512/{z}/{x}/{y}/${RAINVIEWER_COLOR}/1_1.png`;}
  function displayRadarFrame(i){if(!state.frames.length)return;state.frameIndex=Math.max(0,Math.min(i,state.frames.length-1));if(state.radarLayer)state.map.removeLayer(state.radarLayer);
    state.radarLayer=L.tileLayer(radarTileUrl(state.frames[state.frameIndex]),{tileSize:256,opacity:state.opacity,maxNativeZoom:7,maxZoom:18,attribution:'Radar: <a href="https://www.rainviewer.com/">RainViewer</a>',updateWhenIdle:true});
    if(state.radarVisible)state.radarLayer.addTo(state.map);refreshRadarBadge();
    if(perspective){const t=state.frames[state.frameIndex];perspective.setRadar(state.radarVisible?`${state.radarHost}${t.path}/512/{z}/{x}/{y}/2/1_1.png`:'',state.opacity);}
  }
  async function updateRadar(){try{const ctl=new AbortController();const timeout=setTimeout(()=>ctl.abort(),13000);let resp;try{resp=await fetch(API,{signal:ctl.signal,cache:'no-store'});}finally{clearTimeout(timeout);}if(!resp.ok)throw Error(resp.status);
    const obj=await resp.json();if(!obj.host||!obj.radar?.past?.length)throw Error('Sem mosaicos');
    const frames=obj.radar.past.slice(-6);if(frames.at(-1)?.time===state.frames.at(-1)?.time)return;
    stopRadarAnimation();state.radarHost=obj.host.replace(/\/$/,'');state.frames=frames;$('radarTimeline').max=frames.length-1;$('radarTimeline').disabled=false;displayRadarFrame(frames.length-1);$('radarDot').classList.remove('error');
  }catch(err){console.warn('Radar indisponível',err);if(!state.frames.length){$('radarAge').textContent='Radar indisponível';$('tripRadarText').textContent='Radar indisponível';$('tripRadarStatus').classList.add('stale');$('radarDot').classList.add('error');}else{$('radarAge').textContent+=' • sem atualização';$('tripRadarText').textContent+=' • sem atualização';$('tripRadarStatus').classList.add('stale');$('radarDot').classList.add('old');}}
  }
  function stopRadarAnimation(){clearInterval(state.animation);state.animation=null;$('radarPlayBtn').textContent='▶';}
  function toggleRadarAnimation(){if(state.animation){stopRadarAnimation();return;}if(!state.frames.length)return;
    if(state.frameIndex===state.frames.length-1)displayRadarFrame(0);
    $('radarPlayBtn').textContent='Ⅱ';state.animation=setInterval(()=>{if(state.frameIndex===state.frames.length-1){stopRadarAnimation();return;}displayRadarFrame(state.frameIndex+1);},2200);
  }
  function toggleRadar(on){state.radarVisible=on;$('radarVisibleBtn').textContent=on?'Ligado':'Desligado';$('radarVisibleBtn').classList.toggle('on',on);$('radarVisibleBtn').setAttribute('aria-pressed',String(on));if(state.radarLayer){if(on)state.radarLayer.addTo(state.map);else state.map.removeLayer(state.radarLayer);}}
  function toggleCoverage(on){state.coverage=on;$('radarCoverageBtn').textContent=on?'Ligada':'Desligada';$('radarCoverageBtn').classList.toggle('on',on);$('radarCoverageBtn').setAttribute('aria-pressed',String(on));if(state.coverageLayer){state.map.removeLayer(state.coverageLayer);state.coverageLayer=null;}if(on){const host=state.radarHost||'https://tilecache.rainviewer.com';state.coverageLayer=L.tileLayer(host+'/v2/coverage/0/512/{z}/{x}/{y}/0/0_0.png',{tileSize:256,opacity:.32,maxNativeZoom:7,maxZoom:18,attribution:'Cobertura: RainViewer'}).addTo(state.map);}}
  function zoomToStartGPS(current){
    if(!current||!Number.isFinite(current.lat)||!Number.isFinite(current.lng)||!state.mapReady)return;
    const map=state.map;
    const options={animate:true,duration:1.1,easeLinearity:.3};
    if(typeof map.flyTo==='function')map.flyTo(current,NAV_ZOOM,options);
    else map.setView(current,NAV_ZOOM,options);
  }
  function visibleNavigationFocusY(){
    const mapRect=$('map')?.getBoundingClientRect?.();
    const top=$('navigationPanel')?.getBoundingClientRect?.();
    const bottom=$('tripDashboard')?.getBoundingClientRect?.();
    const size=state.map?.getSize?.();
    if(!mapRect||!size||!top||!bottom||$('navigationPanel').hidden||$('tripDashboard').hidden)return null;
    // Um transform CSS altera o boundingRect visual, não o sistema de pixels do Leaflet.
    // O contêiner é fixed/inset:0; no 2,5D usamos a origem não transformada.
    const mapTop=pseudo3d?0:mapRect.top;
    return MotoNavigation.visibleFocusY(size.y,top.bottom-mapTop,bottom.top-mapTop);
  }
  function refreshNavigationCamera(){
    if(!state.nav.active||!state.gpsPoint||!state.follow)return;
    if(perspective)perspective.update(state.gpsPoint,state.nav.cameraHeading??0,visibleNavigationFocusY());
    else followNavigationCamera(state.gpsPoint,state.nav.latestPosition);
  }
  function setTripPanelCompact(compact,updateCamera=true){
    const panel=$('tripDashboard');
    panel.classList.toggle('compact',!!compact);
    const toggle=$('tripPanelToggleBtn');
    toggle?.setAttribute('aria-expanded',String(!compact));
    toggle?.setAttribute('aria-label',compact?'Expandir detalhes da viagem':'Recolher painel para ver o mapa');
    const label=$('tripPanelToggleLabel');if(label)label.textContent=compact?'Detalhes':'Mapa';
    $('tripPanelToggleIcon')?.setAttribute('href',compact?'#mr-chevron-up':'#mr-chevron-down');
    $('tripCompactCenterBtn').hidden=!compact;
    if(updateCamera)refreshNavigationCamera();
  }
  function recenterNavigation(){
    setFollow(true);
    if(state.nav.waiting){
      state.nav.gpsPermissionDenied=false;
      enableGPS(false); // O watch anterior pode ter sido encerrado por erro.
      const cached=recentNavigationGPS();
      if(cached)beginNavigation(cached.point,cached.position);
      else requestFreshNavigationGPS();
      return;
    }
    // Recolher os controles só quando a viagem já está em andamento.
    // Durante a espera, eles precisam continuar acessíveis para diagnóstico.
    setTripPanelCompact(true,false);
    refreshNavigationCamera();
  }
  function setFollow(on) {
    state.follow=on;
    const btn=$('navigationCenterBtn');
    if(btn){
      btn.setAttribute('aria-pressed',String(on));
      btn.setAttribute('aria-label',on?'Acompanhando a moto: centralizar novamente':'Retomar acompanhamento da moto');
      btn.title=on?'Mapa seguindo a moto':'Retomar acompanhamento';
      btn.classList.toggle('following',on);
    }
  }
  // Durante a navegação, a câmera segue o GPS e deixa mais via visível à frente.
  // O mapa funciona no modo norte-para-cima mesmo se o plugin de rotação falhar.
  function followNavigationCamera(point, position=state.nav.latestPosition) {
    const nav=state.nav;
    if(!nav.active || !state.follow || !state.mapReady)return;
    const accuracy=Number(position?.coords?.accuracy ?? nav.lastAccuracy);
    if(!Number.isFinite(accuracy)||accuracy>100)return;
    const spd=position?.coords?.speed;
    const rawHeading=position?.coords?.heading;
    if(rawHeading!==null && rawHeading!==undefined && Number.isFinite(Number(rawHeading)) && Number(rawHeading)>=0 && Number(rawHeading)<360 && Number.isFinite(Number(spd)) && Number(spd)>=1.8) {
      nav.cameraHeading=Number(rawHeading);
    } else if(nav.cameraPrevious) {
      const moved=MotoNavigation.meters(nav.cameraPrevious,point);
      if(moved>=Math.max(10,accuracy*1.5) && moved<500)nav.cameraHeading=MotoNavigation.bearingBetween(nav.cameraPrevious,point);
    }
    if(!nav.cameraPrevious || MotoNavigation.meters(nav.cameraPrevious,point)>=Math.max(10,accuracy*1.5))nav.cameraPrevious={lat:point.lat,lng:point.lng};
    const map=state.map;
    const hasRotation=typeof map.setHeading==='function' && Number.isFinite(nav.cameraHeading);
    if(hasRotation)map.setHeading(nav.cameraHeading,{ease:.25,deadzone:1});
    const zoom=Math.max(NAV_ZOOM,map.getZoom());
    let target=point;
    if(typeof map.project==='function' && typeof map.unproject==='function' && typeof map.getSize==='function') {
      const size=map.getSize();
      // Reservar o espaço realmente visível entre os painéis em qualquer orientação/tela.
      // Sem isso, centralizar a posição deixa a moto atrás do painel inferior.
      const desiredY=visibleNavigationFocusY();
      const forward=Number.isFinite(desiredY)?desiredY-size.y/2:Math.min(150,Math.max(45,size.y*.15));
      const rad=hasRotation ? nav.cameraHeading*Math.PI/180 : 0;
      const worldPoint=map.project(point,zoom);
      target=map.unproject(L.point(worldPoint.x+Math.sin(rad)*forward,worldPoint.y-Math.cos(rad)*forward),zoom);
    }
    map.setView(target,zoom,{animate:nav.cameraFrames>0,duration:.55,easeLinearity:.4});
    nav.cameraFrames++;
    const marker=state.gpsMarker?.getElement?.();
    if(marker){
      const angle=hasRotation?0:(nav.cameraHeading??0);
      marker.style.setProperty('--gps-heading',`${angle}deg`);
    }
  }
  function gpsError(error){if(error?.code===1)state.nav.gpsPermissionDenied=true;const txt=error?.code===1?'Localização negada. Autorize o GPS no navegador ou digite sua origem.':'GPS indisponível. Você pode preencher a origem manualmente.';toast(txt);if(state.nav.waiting||state.nav.active)navigationStatus(txt);if(error?.code===1&&state.gpsWatch!==null){navigator.geolocation.clearWatch(state.gpsWatch);state.gpsWatch=null;}}
  function updateGPS(pos){
    if(historyRecorder?.isRecording()) historyRecorder.addFix({lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,speed:pos.coords.speed,altitude:pos.coords.altitude},pos.timestamp||Date.now());
    const p=L.latLng(pos.coords.latitude,pos.coords.longitude);state.gpsPoint=p;const accuracy=Math.max(0,Math.round(pos.coords.accuracy||0));
    // Somente o marcador/câmera são alinhados visualmente à rota. A posição original
    // segue para cálculo de desvio e registro GPS, evitando mascarar mudanças reais.
    const snap=state.nav.active && state.routeData?.geometry?.coordinates && window.MotoNavigation?.snapForDisplay
      ? MotoNavigation.snapForDisplay(p,state.routeData.geometry.coordinates,{accuracy,heading:pos.coords.heading,speed:pos.coords.speed})
      : {point:p,matched:false};
    const shown=snap.matched?L.latLng(snap.point.lat,snap.point.lng):p;
    const icon=L.divIcon({className:'',iconSize:[48,52],iconAnchor:[24,26],html:'<div class="gps-vehicle" aria-hidden="true"><svg class="gps-bike" viewBox="0 0 48 52"><ellipse class="bike-tire" cx="24" cy="7" rx="5" ry="6"/><path class="bike-handlebar" d="M10 19H38"/><circle class="bike-mirror" cx="8" cy="19" r="3.5"/><circle class="bike-mirror" cx="40" cy="19" r="3.5"/><path class="bike-body" d="M19 22h10l5 12-5 12H19l-5-12z"/><circle class="bike-helmet" cx="24" cy="18" r="8"/><path class="bike-visor" d="M19 17q5-4 10 0"/><ellipse class="bike-tire" cx="24" cy="47" rx="5" ry="4"/><path class="bike-tail" d="M19 39h10"/></svg></div>'});
    if(!state.gpsMarker){state.gpsMarker=L.marker(shown,{icon,zIndexOffset:700}).addTo(state.map);state.accuracyCircle=L.circle(p,{radius:accuracy,color:'#2c8fff',weight:1,fillOpacity:.07}).addTo(state.map);}
    else{state.gpsMarker.setLatLng(shown);state.accuracyCircle.setLatLng(p).setRadius(accuracy);}
    if(state.nav.active && perspective){if(state.follow)perspective.update(shown,Number.isFinite(pos.coords.heading)?pos.coords.heading:state.nav.cameraHeading??0,visibleNavigationFocusY());}
    else if(state.nav.active)followNavigationCamera(shown,pos);
    else if(state.follow && !state.nav.waiting && !state.nav.building)state.map.setView(p,Math.max(11,state.map.getZoom()),{animate:true});
    if(state.origin.gps){state.origin.point=p;state.origin.label='Sua localização atual';$('originInput').value=state.origin.label;$('gpsUseBtn').classList.add('selected');
      if(!state.nav.active&&!state.nav.waiting&&state.routeLayer&&(!state.lastRoutePoint||p.distanceTo(state.lastRoutePoint)>3000)){state.lastRoutePoint=p;removeRouteLayers();drawRoute();}
    }
    state.nav.lastFixAt=Date.now();state.nav.lastAccuracy=accuracy;state.nav.latestPosition=pos;
    renderPins();$('gpsFloatingBtn').classList.add('active');handleNavPosition(p,pos);
    if(weatherMonitor.optedIn && state.nav.active)analyzeRadarAhead(true);
  }
  function enableGPS(useAsOrigin=false){if(useAsOrigin){state.origin.gps=true;state.origin.point=state.gpsPoint;state.origin.label='Sua localização atual';removeOldRoute();$('originInput').value=state.origin.label;$('gpsUseBtn').classList.add('selected');persist();}
    if(!navigator.geolocation){toast('Este navegador não oferece localização. Digite uma origem.');return;}
    if(!window.isSecureContext){toast('Abra a página em HTTPS para usar GPS.');return;}
    // Quando estamos iniciando viagem, deixar o flyTo fazer pan/zoom suave até o GPS.
    setFollow(true);if(state.gpsPoint && !state.nav.active && !state.nav.waiting && !state.nav.building)state.map.setView(state.gpsPoint,Math.max(12,state.map.getZoom()));
    if(state.gpsWatch===null)state.gpsWatch=navigator.geolocation.watchPosition(updateGPS,gpsError,{enableHighAccuracy:true,timeout:18000,maximumAge:12000});
    if(useAsOrigin&&!state.gpsPoint)toast('Solicitando permissão de localização…');
  }
  function initMap(){state.map=L.map('map',{zoomControl:false,preferCanvas:true,rotate:true,touchRotate:false,dragRotate:false,rotateControl:false}).setView([-15.7942,-47.8822],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(state.map);
    state.mapReady=true;state.map.on('click',e=>{if(state.pickTarget){setPoint(state.pickTarget,e.latlng);stopPick();setMinimized(false);}});
    state.map.on('dragstart',()=>{setFollow(false);});renderPins();
  }
  function initEvents(){ $('navigation3dBtn').onclick=togglePerspective;
    $('supportBtn').onclick=openSupport;$('supportCloseBtn').onclick=()=>$('supportPanel').hidden=true;$('supportSearchBtn').onclick=searchSupport;
    $('tripRecordBtn').onclick=toggleRecording;$('tripHistoryBtn').onclick=openHistory;$('historyCloseBtn').onclick=()=>$('historyPanel').hidden=true;
    $('settingsBtn').onclick=openSettings;$('radarQuickBtn').onclick=openSettings;$('settingsClose').onclick=closeSettings;
    $('settingsPanel').addEventListener('click',e=>{if(e.target===$('settingsPanel'))closeSettings();});
    $('routeToggle').onclick=()=>setMinimized(!$('routePanel').classList.contains('minimized'));
    $('editRouteBtn').onclick=()=>setMinimized(false);
    for(const [id,input] of [['origin','originInput'],['destination','destinationInput']]){
      $(input).addEventListener('input',e=>changeText(id,e.target.value));
      $(input).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchPlace(id);}});
    }
    document.querySelectorAll('.place-search[data-search]').forEach(btn=>btn.onclick=()=>searchPlace(btn.dataset.search));
    $('gpsUseBtn').onclick=()=>enableGPS(true);$('gpsFloatingBtn').onclick=()=>{
      enableGPS(false);
      if(state.nav.waiting){
        state.nav.gpsPermissionDenied=false;
        const cached=recentNavigationGPS();
        if(cached)beginNavigation(cached.point,cached.position);
        else requestFreshNavigationGPS();
      }
    };
    $('addStopBtn').onclick=addStop;$('clearBtn').onclick=clearRoute;$('drawRouteBtn').onclick=drawRoute;
    $('brasiliaTourBtn').onclick=loadBrasiliaTour;
    $('mapsBtn').onclick=openMaps;$('wazeBtn').onclick=openWaze;
    $('startNavigationBtn').onclick=startNavigation; $('navigationStopBtn').onclick=()=>stopNavigation();
    $('tripSettingsBtn').onclick=openSettings;
    $('navigationViewPreference').onchange=e=>{
      saveNavigationViewPreference(e.target.value);
      // Preferência ajustada durante a navegação será aplicada na próxima partida.
    };
    $('navigationFullscreenBtn').onclick=toggleFullscreen;$('fullscreenFloatingBtn').onclick=toggleFullscreen;
    document.addEventListener('fullscreenchange',()=>{if(!isFullscreen())state.nav.fullscreenOwned=false;refreshFullscreenButtons();});
    $('navigationCenterBtn').onclick=recenterNavigation;
    $('tripCompactCenterBtn').onclick=recenterNavigation;
    $('tripPanelToggleBtn').onclick=()=>setTripPanelCompact(!$('tripDashboard').classList.contains('compact'));
    $('navigationVoiceBtn').onclick=()=>{state.nav.muted=!state.nav.muted;setVoiceButton();if(state.nav.muted)try{speechSynthesis.cancel();}catch(_){}};
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState!=='visible'||(!state.nav.active&&!state.nav.waiting))return;
      keepAwake();
      if(state.nav.waiting){
        const cached=recentNavigationGPS();
        if(cached)beginNavigation(cached.point,cached.position);
        else requestFreshNavigationGPS();
      }
    });
    window.addEventListener('resize',()=>{if(state.nav.active&&state.follow)requestAnimationFrame(refreshNavigationCamera);});
    document.querySelectorAll('.map-pick[data-pick]').forEach(btn=>btn.onclick=()=>setPick(btn.dataset.pick));$('cancelPickBtn').onclick=()=>{stopPick();setMinimized(false);};
    $('radarVisibleBtn').onclick=()=>toggleRadar(!state.radarVisible);
    $('radarCoverageBtn').onclick=()=>toggleCoverage(!state.coverage);
    $('radarOpacity').oninput=e=>{state.opacity=Number(e.target.value)/100;$('opacityTxt').textContent=e.target.value+'%';state.radarLayer?.setOpacity(state.opacity);};
    $('radarTimeline').oninput=e=>{stopRadarAnimation();displayRadarFrame(Number(e.target.value));};
    $('radarPrevBtn').onclick=()=>{stopRadarAnimation();displayRadarFrame(state.frameIndex-1);};
    $('radarNextBtn').onclick=()=>{stopRadarAnimation();displayRadarFrame(state.frameIndex+1);};
    $('radarPlayBtn').onclick=toggleRadarAnimation;$('radarRefreshBtn').onclick=updateRadar;
    $('radarMotionBtn').onclick=analyzeEchoMotion;
    $('radarAheadBtn').onclick=()=>analyzeRadarAhead(false);$('radarAlertOptIn').onchange=e=>{weatherMonitor.optedIn=!!e.target.checked;try{localStorage.setItem('motoradar-weather-optin-v1',String(weatherMonitor.optedIn));}catch(_){};};
  }
  function init(){if(typeof L==='undefined'){toast('O mapa não carregou. Confira sua conexão.');return;}
    try{stopsClient=window.MotoStops?.createClient();}catch(e){console.warn('Pontos de apoio indisponíveis',e);}
    try{historyRecorder=window.MotoTripHistory?.createStore(localStorage);}catch(e){console.warn('Histórico indisponível',e);}
    try{weatherMonitor.optedIn=localStorage.getItem('motoradar-weather-optin-v1')==='true';}catch(_){}
    $('radarAlertOptIn').checked=weatherMonitor.optedIn;
    restore();restoreNavigationViewPreference();initMap();renderStops();setVoiceButton();setRecordingButton(false);$('originInput').value=state.origin.label;$('destinationInput').value=state.destination.label;
    initEvents();updateRadar();setInterval(updateRadar,600000);setInterval(refreshRadarBadge,60000);
    setInterval(()=>{
      const nav=state.nav;
      if(nav.waiting && !nav.gpsRequestPending && !nav.gpsPermissionDenied &&
         Date.now()-nav.lastGpsAttemptAt>=GPS_RETRY_INTERVAL_MS){
        const cached=recentNavigationGPS();
        if(cached)beginNavigation(cached.point,cached.position);
        else requestFreshNavigationGPS();
      }
      if(nav.active && nav.lastFixAt && Date.now()-nav.lastFixAt>25000){
        $('navigationGpsState').textContent='Sinal GPS perdido • confira a localização';
        $('tripSpeed').textContent='—';$('tripArrival').textContent='—';
      }
    },8000);
    const queryTour=new URLSearchParams(location.search).get('roteiro');
    const hashTour=new URLSearchParams(location.hash.replace(/^#/, '')).get('roteiro');
    if(queryTour==='brasilia'||hashTour==='brasilia')loadBrasiliaTour();
    if('serviceWorker' in navigator && location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
  window.addEventListener('load',init);
})();
