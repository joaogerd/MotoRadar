"""Unit and browser integration coverage for experimental foreground navigation."""
from pathlib import Path
import pytest
import subprocess
import json
import re
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'public'

ROUTE = {
  "code": "Ok",
  "routes": [{
    "distance": 2200,
    "duration": 240,
    "geometry": {"type":"LineString", "coordinates":[[-48.0,-15.8],[-47.99,-15.8],[-47.98,-15.8]]},
    "legs": [{"steps": [
      {"distance":1100,"duration":120,"name":"Via Principal","maneuver":{"type":"depart","location":[-48,-15.8]}},
      {"distance":1100,"duration":120,"name":"Avenida Brasil","maneuver":{"type":"turn","modifier":"right","location":[-47.99,-15.8]}},
      {"distance":0,"duration":0,"name":"","maneuver":{"type":"arrive","location":[-47.98,-15.8]}}
    ]}]
  }]
}


def run_node(js):
    result=subprocess.run(['node','-e',js],cwd=ROOT,capture_output=True,text=True,timeout=10)
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_heading_from_points_when_gps_heading_unavailable():
    vals=run_node("""const nav=require('./navigation.js');console.log(JSON.stringify({north:nav.bearingBetween({lat:0,lng:0},{lat:1,lng:0}),east:nav.bearingBetween({lat:0,lng:0},{lat:0,lng:1})}));""")
    assert abs(vals['north'])<0.01
    assert abs(vals['east']-90)<0.01


def test_turn_instructions_and_gps_off_route_recalculation():
    data = run_node('''
const N=require('./navigation.js');
const route=%s;
const session=N.createSession(route, ['Destino']);
const first=session.update({lat:-15.8,lng:-48.0,accuracy:12,heading:75},1000);
const before=session.update({lat:-15.8,lng:-47.992,accuracy:12},5000);
const off1=session.update({lat:-15.81,lng:-47.992,accuracy:8},25000);
const off2=session.update({lat:-15.81,lng:-47.992,accuracy:8},30000);
const off3=session.update({lat:-15.81,lng:-47.992,accuracy:8},36000);
console.log(JSON.stringify({first,before,off1,off2,off3}));
''' % json.dumps(ROUTE['routes'][0]))
    assert 'direita' in data['first']['instruction'].lower()
    assert data['first']['remainingMeters'] > 2000
    assert data['before']['maneuverMeters'] < data['first']['maneuverMeters']
    assert not data['off1']['reroute']
    assert not data['off2']['reroute']
    assert data['off3']['reroute']


def test_maneuver_roundabout_and_passed_stop():
    route = ROUTE['routes'][0].copy()
    route['legs'] = [
       {"steps":[
          {"distance":1100,"name":"Rua A","maneuver":{"type":"depart","location":[-48,-15.8]}},
          {"distance":0,"name":"","maneuver":{"type":"arrive","location":[-47.99,-15.8]}}
       ]},
       {"steps":[
          {"distance":1100,"name":"Rua B","maneuver":{"type":"depart","location":[-47.99,-15.8]}},
          {"distance":0,"name":"","maneuver":{"type":"arrive","location":[-47.98,-15.8]}}
       ]}
    ]
    data=run_node('''
const N=require('./navigation.js'); const s=N.createSession(%s,['Parada 1','Destino']);
let a=s.update({lat:-15.8,lng:-48.0,accuracy:9},0);
let b=s.update({lat:-15.8,lng:-47.9898,accuracy:9},14000);
let c=s.update({lat:-15.8,lng:-47.98,accuracy:9},30000);
console.log(JSON.stringify({a,b,c,round:N.instructionFor({maneuver:{type:'roundabout',exit:2},name:'Via Central'})}));
''' % json.dumps(route))
    assert data['b']['passedStops'] == 1
    assert data['c']['finished'] is True
    assert 'rotatória' in data['round'].lower()


def test_navigation_ignores_low_accuracy_for_off_route():
    data=run_node('''
const N=require('./navigation.js');const s=N.createSession(%s,['Destino']);
const a=[];for(let i=0;i<6;i++)a.push(s.update({lat:-15.81,lng:-47.99,accuracy:270},(i+1)*10000));
console.log(JSON.stringify(a));
'''%json.dumps(ROUTE['routes'][0]))
    assert not any(x['reroute'] for x in data)
    assert all(x['lowAccuracy'] for x in data)


class Static(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args): pass


@pytest.mark.parametrize('elapsed_ms,expected_one_shots,fail_first', [(20000,0,False),(90000,1,False),(90000,2,True)])
def test_browser_can_start_and_stop_navigation_with_voice_without_leaving_app(elapsed_ms,expected_one_shots,fail_first):
    server=ThreadingHTTPServer(('127.0.0.1',0),Static)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844})
            context.add_init_script('''
                window.__mapViews=[];window.__mapFlights=[];window.__mapHeadings=[];window.__mapHandlers={};
                window.__savedPrefs={};
                Object.defineProperty(window,'localStorage',{configurable:true,value:{
                   getItem:(k)=>window.__savedPrefs[k]??null,
                   setItem:(k,v)=>{window.__savedPrefs[k]=String(v)},
                   removeItem:(k)=>{delete window.__savedPrefs[k]}
                }});
                Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
                window.__lines=0;window.__spoken=[];window.__routes=[];
                window.__fullscreenRequests=0;window.__fullscreenExits=0;window.__fullscreen=null;
                Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.__fullscreen});
                Element.prototype.requestFullscreen=function(){window.__fullscreen=this;window.__fullscreenRequests++;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve()};
                document.exitFullscreen=function(){window.__fullscreen=null;window.__fullscreenExits++;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve()};
                Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:(u)=>window.__spoken.push(u.text),cancel:()=>{},getVoices:()=>[]}});
                window.SpeechSynthesisUtterance=function(text){this.text=text;this.lang='pt-BR'};
                window.__watchCalls=0;window.__oneShots=0;
                const gpsFix=()=>({coords:{latitude:-15.8,longitude:-48,accuracy:9,heading:110,speed:12},timestamp:Date.now()});
                Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
                  watchPosition:(success,fail)=>{
                    window.__gps=success;window.__watchCalls++;
                    // O watchPosition entrega o primeiro fix antes da viagem e não
                    // chama de novo enquanto a moto permanece imóvel.
                    if(window.__watchCalls===1)setTimeout(()=>success(gpsFix()),10);
                    return 77;
                  },
                  getCurrentPosition:(success,fail,opts)=>{
                    window.__oneShots++;window.__oneShotOptions=opts;
                    if(window.__failFirstOneShot && window.__oneShots===1)setTimeout(()=>fail({code:3}),10);
                    else setTimeout(()=>success(gpsFix()),10);
                  },
                  clearWatch:()=>{}
                }});
                const layer=()=>({addTo(){return this},setLatLng(){return this},setRadius(){return this},setOpacity(){return this},getBounds(){return {isValid:()=>true}}});
                window.L={point:(x,y)=>({x,y}),latLng:(lat,lng)=>({lat,lng,distanceTo(p){return Math.hypot((lat-p.lat)*110000,(lng-p.lng)*105000)}}),divIcon:()=>({}),
                map:()=>({setView(point,zoom,opts){window.__mapViews.push({lat:point.lat,lng:point.lng,zoom,opts});return this},flyTo(point,zoom,opts){window.__mapFlights.push({lat:point.lat,lng:point.lng,zoom,opts});return this},getZoom(){return 15},getSize(){return {x:390,y:844}},project(pt){return {x:pt.lng*10000,y:pt.lat*10000}},unproject(pt){return {lat:pt.y/10000,lng:pt.x/10000}},setHeading(h){window.__mapHeadings.push(h);return this},stopHeadingUp(){},setBearing(){},on(k,fn){window.__mapHandlers[k]=fn;return this},fitBounds(){return this},removeLayer(){},panTo(){},getBounds(){return {}}}),tileLayer:()=>layer(),marker:()=>layer(),circle:()=>layer(),geoJSON:()=>{window.__lines++;return layer()},polyline:()=>layer()};
            ''')
            def intercept(route):
                url=route.request.url
                if ('unpkg.com/' in url or 'cdn.jsdelivr.net/' in url) or 'tile.openstreetmap.org' in url or 'tilecache.rainviewer.com' in url:
                    route.abort();return
                if 'api.rainviewer.com/public/weather-maps.json' in url:
                    route.fulfill(status=200,content_type='application/json',body='{"host":"https://tilecache.rainviewer.com","radar":{"past":[{"time":1783092600,"path":"/v2/radar/1783092600"}]}}');return
                if 'router.project-osrm.org/route/v1/driving/' in url:
                    route.fulfill(status=200,content_type='application/json',body=json.dumps(ROUTE));return
                route.continue_()
            context.route('**/*',intercept)
            page=context.new_page()
            page.evaluate('location.hash = "roteiro=brasilia"')
            html=(ROOT/'index.html').read_text()
            html=re.sub(r'<link rel="stylesheet" href="app\.css\?v=\d+">',lambda _: '<style>'+(ROOT/'app.css').read_text()+'</style>',html)
            html=html.replace('<script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>','')
            html=re.sub(r'<script defer src="([a-z-]+\.js)\?v=\d+"></script>',lambda m:'<script>'+(ROOT/m.group(1)).read_text()+'</script>',html)
            page.set_content(html,wait_until='load')
            page.wait_for_function('window.__lines >= 2',timeout=12000)
            assert page.locator('#startNavigationBtn').is_visible()
            # Reproduzir bug relatado: GPS já foi usado para ver a moto no mapa,
            # mas não há novas callbacks do watchPosition enquanto estacionada.
            # Acionar sem coordenadas de tela: o resumo da rota sobrepõe
            # visualmente o botão flutuante no viewport sintético de teste.
            page.evaluate('document.querySelector("#gpsFloatingBtn").click()')
            page.wait_for_function('window.__watchCalls===1 && document.querySelector("#gpsFloatingBtn").classList.contains("active")')
            page.evaluate('''(args) => {
              const clock=Date.now;
              Date.now=()=>clock()+args.elapsed;
              window.__failFirstOneShot=args.fail;
            }''', {'elapsed':elapsed_ms,'fail':fail_first})
            page.locator('#startNavigationBtn').click()
            if expected_one_shots:
                page.wait_for_function('window.__oneShots>=1',timeout=12000)
                assert page.evaluate('window.__oneShotOptions.enableHighAccuracy') is True
                assert page.evaluate('window.__oneShotOptions.maximumAge') == 30000
            if fail_first:
                page.wait_for_function('document.querySelector("#navigationInstruction").textContent.includes("Tentando novamente")',timeout=12000)
                # O botão Centralizar deve reabrir a tentativa sem exigir
                # movimento da motocicleta ou um novo watchPosition.
                page.locator('#navigationCenterBtn').click()
                page.wait_for_function('window.__oneShots>=2',timeout=12000)
            page.wait_for_function('document.querySelector("#navigationInstruction").textContent.includes("Vire")',timeout=12000)
            assert page.evaluate('window.__oneShots') == expected_one_shots
            assert page.evaluate('window.__watchCalls') == 1, 'Não criar watchPosition duplicado'
            page.locator('#navigationPanel').wait_for(state='visible',timeout=12000)
            page.wait_for_function('document.querySelector("#navigationInstruction").textContent.includes("Vire")',timeout=12000)
            assert 'direita' in page.locator('#navigationInstruction').inner_text().lower()
            assert page.locator('#routePanel').is_hidden() or page.locator('#routePanel').evaluate('(el)=>el.classList.contains("minimized")')
            assert page.locator('#tripDashboard').is_visible()
            # Iniciar automaticamente ativa a preferência 2,5D e aproxima o GPS.
            assert page.locator('#map').evaluate('(el)=>el.classList.contains("mr-pseudo3d")')
            assert page.locator('#navigation3dBtn').get_attribute('aria-pressed') == 'true'
            flights=page.evaluate('window.__mapFlights.slice()')
            assert flights and flights[0]['zoom'] == 17
            assert abs(flights[0]['lat']-(-15.8)) < 0.001 and abs(flights[0]['lng']-(-48)) < 0.001
            assert flights[0]['opts']['duration'] > 0.7
            assert any(v['zoom']>=17 for v in page.evaluate('window.__mapViews'))
            # Alternar manualmente define a preferência para as próximas viagens.
            page.locator('#navigation3dBtn').click()
            assert not page.locator('#map').evaluate('(el)=>el.classList.contains("mr-pseudo3d")')
            assert page.evaluate('window.__savedPrefs["motoradar-navigation-view-v1"]') == '2d'
            page.locator('#navigation3dBtn').click()
            assert page.locator('#map').evaluate('(el)=>el.classList.contains("mr-pseudo3d")')
            assert page.locator('#navigationPanel').is_visible()
            assert page.locator('#navigationInstruction').is_visible()
            assert page.locator('#toast').is_hidden()
            assert page.locator('#perspectiveMap').is_hidden()
            assert page.locator('#navigation3dBtn').get_attribute('aria-pressed') == 'true'
            assert page.locator('#navigation3dBtn .action-label').inner_text() == '2D'
            assert page.locator('#map').evaluate('(el)=>getComputedStyle(el).pointerEvents') == 'none'
            page.locator('#navigation3dBtn').click()
            assert not page.locator('#map').evaluate('(el)=>el.classList.contains("mr-pseudo3d")')
            assert page.locator('#navigation3dBtn').get_attribute('aria-pressed') == 'false'
            assert page.locator('#navigationBrand').is_visible()
            metrics_columns=page.locator('#tripMetrics').evaluate('(el)=>getComputedStyle(el).gridTemplateColumns.trim().split(/\\s+/).length')
            assert metrics_columns == 2, 'O painel de métricas deve ter duas colunas legíveis'
            banner=page.locator('#navigationPanel').bounding_box()
            dashboard=page.locator('#tripDashboard').bounding_box()
            brand=page.locator('#navigationBrand').bounding_box()
            toggle=page.locator('#tripPanelToggleBtn').bounding_box()
            assert brand['height'] <= 44, 'Marca não deve ocupar o mapa durante a navegação'
            assert banner['height'] <= 105, 'Instrução precisa ser legível sem criar uma faixa enorme'
            assert dashboard['height'] <= 365, 'Detalhes não devem cobrir a maior parte do mapa'
            assert toggle['y'] >= dashboard['y'], 'Controle Mapa deve ficar dentro do painel e não sobre a estrada'
            assert banner['y']+banner['height']+180 < dashboard['y'], 'Mapa deve ter área útil generosa entre os painéis'
            action=page.locator('#navigationStopBtn').bounding_box()
            assert action['height']>=48, 'O controle crítico deve ter alvo de toque adequado'
            assert page.locator('#tripSpeed').inner_text() == '43'
            # A camera deve acompanhar cada fix GPS e posicionar a moto abaixo do centro.
            first_views=page.evaluate('window.__mapViews.slice()')
            assert first_views, 'A camera nao recebeu nenhuma atualizacao'
            assert first_views[-1]['lat'] != -15.8, 'Camera nao mostra a estrada adiante'
            assert page.evaluate('window.__mapHeadings.at(-1)') == 110
            page.evaluate('window.__gps({coords:{latitude:-15.8001,longitude:-47.999,accuracy:8,heading:100,speed:13}})')
            later_views=page.evaluate('window.__mapViews.slice()')
            assert len(later_views)>len(first_views), 'Camera nao seguiu nova posicao'
            assert page.evaluate('window.__mapHeadings.at(-1)') == 100
            # Um gesto de arrastar pausa o camera-follow; botao GPS retoma imediatamente.
            page.evaluate('window.__mapHandlers.dragstart()')
            paused=page.evaluate('window.__mapViews.length')
            page.evaluate('window.__gps({coords:{latitude:-15.8001,longitude:-47.9985,accuracy:8,heading:100,speed:12}})')
            assert page.evaluate('window.__mapViews.length') == paused
            assert page.locator('#navigationCenterBtn').get_attribute('aria-pressed') == 'false'
            page.locator('#navigationCenterBtn').click()
            assert page.evaluate('window.__mapViews.length') > paused
            assert page.locator('#navigationCenterBtn').get_attribute('aria-pressed') == 'true'
            # Recentrar recolhe o painel, libertando o mapa para ver a rua.
            assert page.locator('#tripDashboard').evaluate('(el)=>el.classList.contains("compact")')
            assert page.locator('#tripPanelToggleBtn').get_attribute('aria-expanded') == 'false'
            assert page.locator('#tripCompactCenterBtn').is_visible()
            assert page.locator('#navigationStopBtn').is_hidden()
            map_y=page.evaluate('''() => {
                const bounds=document.querySelector("#navigationPanel").getBoundingClientRect();
                const bottom=document.querySelector("#tripDashboard").getBoundingClientRect();
                const H=window.L ? 844 : 844;
                return MotoNavigation.visibleFocusY(H,bounds.bottom,bottom.top);
            }''')
            assert map_y>page.locator('#navigationPanel').bounding_box()['y']+50
            assert map_y<page.locator('#tripDashboard').bounding_box()['y']
            # O usuário consegue restaurar os controles e encerrar a viagem.
            page.locator('#tripPanelToggleBtn').click()
            assert not page.locator('#tripDashboard').evaluate('(el)=>el.classList.contains("compact")')
            assert page.locator('#tripPanelToggleBtn').get_attribute('aria-expanded') == 'true'
            assert page.locator('#navigationStopBtn').is_visible()
            page.evaluate('window.__gps({coords:{latitude:-15.8,longitude:-48,accuracy:9,heading:null,speed:null}})')
            assert page.locator('#tripSpeed').inner_text() == '—'
            page.evaluate('window.__gps({coords:{latitude:-15.8,longitude:-48,accuracy:9,heading:110,speed:12}})')
            assert page.locator('#tripSpeed').inner_text() == '43'
            assert page.locator('#tripDistance').inner_text() != '—'
            assert page.locator('#tripArrival').inner_text() != '—'
            assert page.locator('#tripDuration').inner_text() != '—'
            assert 'Radar' in page.locator('#tripRadarStatus').inner_text()
            page.locator('#tripSettingsBtn').click()
            assert page.locator('#settingsPanel').is_visible()
            page.locator('#settingsClose').click()
            assert page.locator('#settingsPanel').is_hidden()
            assert page.locator('#navigationStopBtn').is_visible()
            # A navegação entra em fullscreen com gesto do usuário; botão permite alternar.
            assert page.evaluate('window.__fullscreenRequests') == 1
            assert page.locator('#navigationFullscreenBtn').get_attribute('aria-pressed') == 'true'
            page.locator('#navigationFullscreenBtn').click()
            assert page.evaluate('window.__fullscreen') is None
            page.locator('#navigationFullscreenBtn').click()
            assert page.evaluate('window.__fullscreenRequests') == 2
            page.locator('#navigationStopBtn').click()
            assert page.locator('#navigationPanel').is_hidden()
            assert page.locator('#tripDashboard').is_hidden()
            assert page.evaluate('window.__fullscreen') is None
            assert page.evaluate('window.__fullscreenExits') == 2
            assert page.locator('#routeSummary').is_visible()
            # A preferência 2D salva na viagem anterior deve valer na próxima.
            page.locator('#settingsBtn').click()
            assert page.locator('#navigationViewPreference').input_value() == '2d'
            page.locator('#settingsClose').click()
            page.locator('#startNavigationBtn').click()
            page.locator('#navigationPanel').wait_for(state='visible',timeout=12000)
            page.wait_for_function('document.querySelector("#navigationInstruction").textContent.includes("Vire")',timeout=12000)
            assert page.locator('#navigation3dBtn').get_attribute('aria-pressed') == 'false'
            assert not page.locator('#map').evaluate('(el)=>el.classList.contains("mr-pseudo3d")')
            page.locator('#navigationStopBtn').click()
            # Alteração explícita em Configurações muda a visão da próxima viagem.
            page.locator('#settingsBtn').click()
            page.locator('#navigationViewPreference').select_option('2.5d')
            assert page.evaluate('window.__savedPrefs["motoradar-navigation-view-v1"]') == '2.5d'
            page.locator('#settingsClose').click()
            page.locator('#startNavigationBtn').click()
            page.locator('#navigationPanel').wait_for(state='visible',timeout=12000)
            page.wait_for_function('document.querySelector("#navigationInstruction").textContent.includes("Vire")',timeout=12000)
            assert page.locator('#map').evaluate('(el)=>el.classList.contains("mr-pseudo3d")')
            page.locator('#navigationStopBtn').click()
            # O mapa também pode ser ampliado antes de iniciar a navegação.
            before_requests=page.evaluate('window.__fullscreenRequests')
            before_exits=page.evaluate('window.__fullscreenExits')
            page.locator('#fullscreenFloatingBtn').click()
            assert page.evaluate('window.__fullscreenRequests') == before_requests+1
            page.locator('#fullscreenFloatingBtn').click()
            assert page.evaluate('window.__fullscreenExits') == before_exits+1
            assert page.evaluate('window.__spoken.length') >= 1
            browser.close()
    finally:
        server.shutdown();server.server_close()

def test_visible_focus_y_never_enters_panels():
    results=run_node("""const N=require('./navigation.js');
const cases=[[844,120,380],[844,120,760],[1536,250,920],[1536,250,1470],[500,180,250]];
console.log(JSON.stringify(cases.map(c=>N.visibleFocusY(...c))));""")
    for y,(height,top,bottom) in zip(results,[[844,120,380],[844,120,760],[1536,250,920],[1536,250,1470],[500,180,250]]):
        assert top < y < bottom
    assert results[1]>results[0]  # painel menor traz a moto para área mais ampla
    assert results[3]>results[2]


def test_compact_dashboard_accessible_without_losing_trip_actions():
    html=(ROOT/'index.html').read_text()
    css=(ROOT/'app.css').read_text()
    js=(ROOT/'app.js').read_text()
    assert 'id="tripPanelToggleBtn"' in html
    assert 'id="tripCompactCenterBtn"' in html
    assert 'aria-controls="tripMetrics tripUtilities tripActions"' in html
    assert '.trip-dashboard.compact .trip-metrics' in css
    assert "function recenterNavigation()" in js
    assert "desiredY-size.y/2" in js
