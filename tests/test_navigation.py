"""Unit and browser integration coverage for experimental foreground navigation."""
from pathlib import Path
import subprocess
import json
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


def test_browser_can_start_and_stop_navigation_with_voice_without_leaving_app():
    server=ThreadingHTTPServer(('127.0.0.1',0),Static)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844})
            context.add_init_script('''
                Object.defineProperty(window,'isSecureContext',{configurable:true,value:true});
                window.__lines=0;window.__spoken=[];window.__routes=[];
                window.__fullscreenRequests=0;window.__fullscreenExits=0;window.__fullscreen=null;
                Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>window.__fullscreen});
                Element.prototype.requestFullscreen=function(){window.__fullscreen=this;window.__fullscreenRequests++;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve()};
                document.exitFullscreen=function(){window.__fullscreen=null;window.__fullscreenExits++;document.dispatchEvent(new Event('fullscreenchange'));return Promise.resolve()};
                Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:(u)=>window.__spoken.push(u.text),cancel:()=>{},getVoices:()=>[]}});
                window.SpeechSynthesisUtterance=function(text){this.text=text;this.lang='pt-BR'};
                Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(success,fail)=>{window.__gps=success;setTimeout(()=>success({coords:{latitude:-15.8,longitude:-48,accuracy:9,heading:110,speed:12}}),10);return 77},clearWatch:()=>{}}});
                const layer=()=>({addTo(){return this},setLatLng(){return this},setRadius(){return this},setOpacity(){return this},getBounds(){return {isValid:()=>true}}});
                window.L={latLng:(lat,lng)=>({lat,lng,distanceTo(p){return Math.hypot((lat-p.lat)*110000,(lng-p.lng)*105000)}}),divIcon:()=>({}),
                map:()=>({setView(){return this},getZoom(){return 15},on(){return this},fitBounds(){return this},removeLayer(){},panTo(){},getBounds(){return {}}}),tileLayer:()=>layer(),marker:()=>layer(),circle:()=>layer(),geoJSON:()=>{window.__lines++;return layer()},polyline:()=>layer()};
            ''')
            def intercept(route):
                url=route.request.url
                if 'unpkg.com/' in url or 'tile.openstreetmap.org' in url or 'tilecache.rainviewer.com' in url:
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
            html=html.replace('<link rel="stylesheet" href="app.css?v=7">','<style>'+ (ROOT/'app.css').read_text()+'</style>')
            html=html.replace('<script defer src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>','')
            html=html.replace('<script defer src="navigation.js?v=7"></script>','<script>'+ (ROOT/'navigation.js').read_text()+'</script>')
            html=html.replace('<script defer src="app.js?v=7"></script>','<script>'+ (ROOT/'app.js').read_text()+'</script>')
            page.set_content(html,wait_until='load')
            page.wait_for_function('window.__lines >= 2',timeout=12000)
            assert page.locator('#startNavigationBtn').is_visible()
            page.locator('#startNavigationBtn').click()
            page.locator('#navigationPanel').wait_for(state='visible',timeout=12000)
            page.wait_for_function('document.querySelector("#navigationInstruction").textContent.includes("Vire")',timeout=12000)
            assert 'direita' in page.locator('#navigationInstruction').inner_text().lower()
            assert page.locator('#routePanel').is_hidden() or page.locator('#routePanel').evaluate('(el)=>el.classList.contains("minimized")')
            assert page.locator('#tripDashboard').is_visible()
            assert page.locator('#tripSpeed').inner_text() == '43'
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
            # O mapa também pode ser ampliado antes de iniciar a navegação.
            page.locator('#fullscreenFloatingBtn').click()
            assert page.evaluate('window.__fullscreenRequests') == 3
            page.locator('#fullscreenFloatingBtn').click()
            assert page.evaluate('window.__fullscreenExits') == 3
            assert page.evaluate('window.__spoken.length') >= 1
            browser.close()
    finally:
        server.shutdown();server.server_close()
