from pathlib import Path
import http.server, socketserver, threading
from playwright.sync_api import sync_playwright

PORT=8877
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def test_route_search_and_map_selection():
    root=Path(__file__).resolve().parents[1]/'public'
    class Server(socketserver.TCPServer):allow_reuse_address=True
    import os
    old=os.getcwd();os.chdir(root)
    try:
      with Server(('127.0.0.1',PORT),Quiet) as server:
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
          with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=('/usr/bin/chromium' if Path('/usr/bin/chromium').exists() else None),args=['--no-sandbox'])
            context=browser.new_context(viewport={'width':390,'height':844},geolocation={'latitude':-15.8,'longitude':-47.9},permissions=['geolocation'])
            context.add_init_script("""
            window.__events={};window.__fitBounds=0;window.__lines=0;
            Object.defineProperty(window,'isSecureContext',{configurable:true,get:()=>true});
            Object.defineProperty(navigator,'geolocation',{configurable:true,value:{watchPosition:(success)=>{success({coords:{latitude:-15.8,longitude:-47.9,accuracy:3}});return 1;},clearWatch(){}}});
            const layer=(geometry=null)=>({addTo(map){this.map=map;return this},setOpacity(){},setLatLng(){return this},setRadius(){return this},bindPopup(){return this},openPopup(){return this},getBounds(){return {isValid:()=>true}}});
            window.L={
               latLng:(lat,lng)=>({lat,lng,distanceTo(other){return 3500}}),
               divIcon:()=>({}),
               map:()=>({setView(){return this},getZoom(){return 12},on(ev,cb){window.__events[ev]=cb;return this},fitBounds(bounds,opts){window.__fitBounds++},removeLayer(){return this},invalidateSize(){return this}}),
               tileLayer:()=>layer(),marker:()=>layer(),circle:()=>layer(),
               geoJSON:()=>{window.__lines++;return layer()},polyline:()=>layer()
            };
            """)
            def intercept(route):
              u=route.request.url
              if 'unpkg.com' in u or 'tile.openstreetmap.org' in u or 'tilecache.rainviewer.com' in u:route.abort();return
              if 'api.rainviewer.com/public/weather-maps.json' in u:route.fulfill(status=200,content_type='application/json',body='{"host":"https://tilecache.rainviewer.com","radar":{"past":[{"time":1783092600,"path":"/v2/radar/1783092600"}]}}');return
              if 'nominatim.openstreetmap.org/search' in u:route.fulfill(status=200,content_type='application/json',body='[{"lat":"-15.797","lon":"-47.867","display_name":"Praça dos Três Poderes, Brasília, DF"}]');return
              if 'router.project-osrm.org/route' in u:route.fulfill(status=200,content_type='application/json',body='{"routes":[{"distance":12345,"duration":1110,"geometry":{"type":"LineString","coordinates":[[-47.9,-15.8],[-47.867,-15.797]]}}]}');return
              route.continue_()
            context.route('**/*',intercept)
            page=context.new_page()
            page.set_content((root/'index.html').read_text(),wait_until='load',timeout=20000)
            page.locator('#gpsBtn').click()
            page.wait_for_function("document.querySelector('#gpsStatus').textContent.includes('GPS ±')",timeout=6000)
            page.locator('#destSearch').fill('Praça dos Três Poderes')
            page.locator('#searchBtn').click()
            result=page.locator('.search-item')
            result.first.wait_for(timeout=5000)
            result.first.click()
            assert page.locator('#controlPanel').evaluate('(e)=>e.classList.contains("collapsed")')
            print('GPS',page.locator('#gpsStatus').inner_text(),'route',page.locator('#routeInfo').inner_text(),'stats',page.evaluate('({fit:window.__fitBounds, lines:window.__lines})'));page.wait_for_function('window.__fitBounds > 0 && window.__lines > 0',timeout=6000)
            page.locator('#panelToggle').click()
            assert '12.3 km' in page.locator('#routeInfo').inner_text()
            assert not page.locator('#mapsBtn').is_disabled()
            assert not page.locator('#wazeBtn').is_disabled()
            page.locator('#clearBtn').click()
            assert page.locator('#mapsBtn').is_disabled()
            page.locator('#pickDestinationBtn').click()
            assert 'Toque em um ponto' in page.locator('#mapNotice').inner_text()
            page.evaluate('window.__events.click({latlng:L.latLng(-15.76,-47.86)})')
            page.wait_for_function('window.__lines >= 2',timeout=6000)
            assert page.locator('#controlPanel').evaluate('(e)=>e.classList.contains("collapsed")')
            browser.close()
        finally:server.shutdown()
    finally:os.chdir(old)
