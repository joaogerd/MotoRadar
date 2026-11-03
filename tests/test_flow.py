import os, http.server, socketserver, threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]/'public'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass


def test_multi_stop_without_gps_and_settings():
    class Server(socketserver.TCPServer): allow_reuse_address=True
    cwd=os.getcwd(); os.chdir(ROOT)
    try:
        with Server(('127.0.0.1',8877), Quiet) as server:
            th=threading.Thread(target=server.serve_forever,daemon=True);th.start()
            try:
                with sync_playwright() as p:
                    browser=p.chromium.launch(headless=True,executable_path=('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),args=['--no-sandbox'])
                    context=browser.new_context(viewport={'width':390,'height':844})
                    context.add_init_script("""
                    window.__events={}; window.__lines=0;window.__routeURLs=[];window.__fit=0;window.__opened=[];
                    window.open=(url)=>{window.__opened.push(url);};
                    const layer=()=>({addTo(){return this},remove(){},setOpacity(){},setLatLng(){return this},setRadius(){return this},bindPopup(){return this},getBounds(){return {isValid:()=>true}}});
                    window.L={latLng:(lat,lng)=>({lat,lng,distanceTo(){return 3000}}), divIcon:()=>({}),
                      map:()=>({setView(){return this},getZoom(){return 11},on(k,fn){window.__events[k]=fn;return this},fitBounds(){window.__fit++;return this},removeLayer(){},invalidateSize(){},getBounds(){return {} }}),
                      tileLayer:()=>layer(),marker:()=>layer(),circle:()=>layer(),geoJSON:()=>{window.__lines++;return layer()},polyline:()=>layer()};
                    """)
                    def intercept(route):
                        url=route.request.url
                        if any(host in url for host in ['unpkg.com','tile.openstreetmap.org','tilecache.rainviewer.com']):
                            route.abort();return
                        if 'api.rainviewer.com/public/weather-maps.json' in url:
                            route.fulfill(status=200,content_type='application/json',body='{"host":"https://tilecache.rainviewer.com","radar":{"past":[{"time":1783092600,"path":"/v2/radar/1783092600"}]}}');return
                        if 'nominatim.openstreetmap.org/search' in url:
                            if 'Taguatinga' in url: val='Taguatinga';lat=-15.83;lon=-48.06
                            elif 'Gama' in url: val='Gama';lat=-16.04;lon=-48.05
                            elif 'Torre' in url: val='Torre de TV';lat=-15.79;lon=-47.89
                            else: val='Brasília';lat=-15.79;lon=-47.88
                            route.fulfill(status=200,content_type='application/json',body='[{"lat":"%s","lon":"%s","display_name":"%s, Distrito Federal, Brasil"}]'%(lat,lon,val));return
                        if 'router.project-osrm.org/route' in url:
                            route.fulfill(status=200,content_type='application/json',body='{"routes":[{"distance":38600,"duration":2810,"geometry":{"type":"LineString","coordinates":[[-48.06,-15.83],[-48.05,-16.04],[-47.88,-15.79]]}}]}');return
                        route.continue_()
                    context.route('**/*',intercept)
                    page=context.new_page()
                    html=(ROOT/'index.html').read_text().replace('<link rel="stylesheet" href="app.css?v=3">','<style>'+ (ROOT/'app.css').read_text()+'</style>').replace('<script defer src="app.js?v=3"></script>','<script>'+ (ROOT/'app.js').read_text()+'</script>')
                    page.set_content(html,wait_until='load')
                    # Build complete route using manual origin, stop, and destination without GPS.
                    def choose(field,name):
                        page.locator(field).fill(name)
                        page.locator(field).locator('xpath=..').locator('.place-search').click()
                        page.locator('.result-item').first.click()
                    choose('#originInput','Taguatinga')
                    page.locator('#addStopBtn').click()
                    choose('.stop-input','Gama')
                    choose('#destinationInput','Brasília')
                    page.locator('#drawRouteBtn').click()
                    page.wait_for_function('window.__lines > 0',timeout=7000)
                    assert '38,6 km' in page.locator('#routeInfo').inner_text()
                    assert page.locator('#routePanel').evaluate('(el)=>el.classList.contains("minimized")')
                    assert page.locator('#settingsPanel').is_hidden()
                    page.locator('#settingsBtn').click()
                    assert page.locator('#settingsPanel').is_visible()
                    page.locator('#settingsClose').click()
                    assert page.locator('#settingsPanel').is_hidden()
                    page.locator('#mapsBtn').click()
                    opened=page.evaluate('window.__opened.at(-1)')
                    assert 'waypoints=' in opened and 'origin=' in opened and 'destination=' in opened
                    assert 'Gama' not in opened # URLs usam coordenadas, não texto não validado
                    page.screenshot(path='/mnt/data/MotoRadar-v03-mapa.png',full_page=True)
                    page.locator('#routeToggle').click()
                    assert page.locator('#routePanel').evaluate('(el)=>!el.classList.contains("minimized")')
                    browser.close()
            finally:
                server.shutdown()
    finally:
        os.chdir(cwd)
