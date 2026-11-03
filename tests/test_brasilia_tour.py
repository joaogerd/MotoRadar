"""Integration test for saved Brasília tour deep link. No live APIs used."""
import json
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'public'

class StaticHandler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,format,*args): pass


def test_brasilia_tour_deep_link_loads_eight_stops_and_draws_circuit():
    server = ThreadingHTTPServer(('127.0.0.1',0),StaticHandler)
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844})
            context.add_init_script("""
            window.__fit = 0; window.__routeURL = ''; window.__lines = 0;
            const store={};
            Object.defineProperty(window,'localStorage',{configurable:true,value:{
              setItem:(k,v)=>{store[k]=String(v)},getItem:(k)=>store[k]||null,
              removeItem:(k)=>delete store[k]}});
            const layer=()=>({addTo(){return this},remove(){},setOpacity(){},setLatLng(){return this},setRadius(){return this},getBounds(){return {isValid:()=>true}}});
            window.L={latLng:(lat,lng)=>({lat,lng,distanceTo(){return 3000}}),divIcon:()=>({}),
                map:()=>({setView(){return this},getZoom(){return 11},on(){return this},fitBounds(){window.__fit++;return this},removeLayer(){},panTo(){},invalidateSize(){},getBounds(){return {}}}),
                tileLayer:()=>layer(),marker:()=>layer(),circle:()=>layer(),geoJSON:()=>{window.__lines++;return layer()},polyline:()=>layer()};
            """)
            def intercept(route):
                url=route.request.url
                if any(domain in url for domain in ['unpkg.com','tile.openstreetmap.org','tilecache.rainviewer.com']):
                    route.abort(); return
                if 'api.rainviewer.com/public/weather-maps.json' in url:
                    route.fulfill(status=200,content_type='application/json',body='{"host":"https://tilecache.rainviewer.com","radar":{"past":[{"time":1783092600,"path":"/v2/radar/1783092600"}]}}');return
                if 'nominatim.openstreetmap.org/search' in url:
                    import urllib.parse
                    query=urllib.parse.parse_qs(urllib.parse.urlsplit(url).query).get('q',[''])[0]
                    terms=['ADE Conjunto 16','Memorial JK','Torre de TV','Santuário Dom Bosco','Catedral Metropolitana','Praça dos Três Poderes','Ponte JK','Pontão do Lago Sul','Ermida Dom Bosco']
                    idx=next((i for i,term in enumerate(terms) if term.lower() in query.lower()),-1)
                    if idx < 0:
                        route.fulfill(status=200,content_type='application/json',body='[]');return
                    route.fulfill(status=200,content_type='application/json',body=json.dumps([{'lat':str(-15.88+idx*.013),'lon':str(-48.04+idx*.019),'display_name':terms[idx]+', Brasília, DF'}]));return
                if 'router.project-osrm.org/route/' in url:
                    from urllib.parse import unquote
                    route.fulfill(status=200,content_type='application/json',body=json.dumps({'code':'Ok','routes':[{'distance':84200,'duration':7800,'geometry':{'type':'LineString','coordinates':[[-48.04,-15.88],[-47.91,-15.79],[-48.04,-15.88]]}}]}))
                    return
                route.continue_()
            context.route('**/*',intercept)
            page=context.new_page()
            route_calls=[];geocode_calls=[]
            def capture(request):
                if 'router.project-osrm.org/route/' in request.url:route_calls.append(request.url)
            page.on('request',capture)
            def geocode_capture(request):
                if 'nominatim.openstreetmap.org/search' in request.url:geocode_calls.append(request.url)
            page.on('request',geocode_capture)
            page.evaluate('location.hash = "roteiro=brasilia"')
            html=(ROOT/'index.html').read_text().replace('<link rel="stylesheet" href="app.css?v=5">','<style>'+(ROOT/'app.css').read_text()+'</style>').replace('<script defer src="navigation.js?v=5"></script>','<script>'+(ROOT/'navigation.js').read_text()+'</script>').replace('<script defer src="app.js?v=5"></script>','<script>'+(ROOT/'app.js').read_text()+'</script>')
            page.set_content(html,wait_until='load')
            page.locator('#originInput').wait_for(state='attached',timeout=1500)
            assert page.locator('#originInput').input_value().startswith('Dok Hotel')
            page.wait_for_function('window.__lines >= 2',timeout=25000)
            assert page.locator('#stopsList .route-field').count()==8
            assert page.locator('#originInput').input_value().startswith('Dok Hotel')
            assert page.locator('#destinationInput').input_value().startswith('Dok Hotel')
            stop_labels=page.locator('#stopsList input').evaluate_all('(els)=>els.map(e=>e.value)')
            assert stop_labels==['Memorial JK','Torre de TV de Brasília','Santuário Dom Bosco','Catedral Metropolitana de Brasília','Praça dos Três Poderes','Ponte JK (passagem)','Pontão do Lago Sul','Ermida Dom Bosco']
            assert '84,2 km' in page.locator('#routeInfo').inner_text()
            assert route_calls and len(route_calls[-1].split('/route/v1/driving/')[1].split('?')[0].split(';'))==10
            assert page.evaluate('window.__fit') >= 1
            assert page.locator('#routePanel').evaluate('(el)=>el.classList.contains("minimized")')
            saved=page.evaluate('JSON.parse(localStorage.getItem("motoradar-route-v03"))')
            assert saved['origin']['point']==saved['destination']['point']
            assert abs(saved['origin']['point']['lat'] - (-15.877349)) < 0.000001
            assert abs(saved['origin']['point']['lng'] - (-48.013305)) < 0.000001
            assert not geocode_calls, 'O roteiro pré-georreferenciado não deve depender do Nominatim'
            assert abs(saved['stops'][5]['point']['lat'] - (-15.823611)) < 0.000002
            assert len(saved['stops'])==8
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
