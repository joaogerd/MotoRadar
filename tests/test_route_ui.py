from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).parents[1]

class Ids(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
    def handle_starttag(self, tag, attrs):
        self.ids.update(value for key, value in attrs if key == 'id')


def test_simple_navigation_and_weather_settings():
    doc = (ROOT/'public/index.html').read_text()
    parser = Ids(); parser.feed(doc)
    assert {'originInput','destinationInput','stopsList','addStopBtn','drawRouteBtn','routeInfo','settingsBtn','settingsPanel','radarOpacity','radarTimeline','gpsUseBtn','mapsBtn','wazeBtn','routeToggle'}.issubset(parser.ids)
    assert 'public' not in doc.lower().split('<title>')[1].split('</title>')[0]


def test_multi_stops_routes_and_maps_url_present():
    js = (ROOT/'public/app.js').read_text()
    assert 'router.project-osrm.org/route/v1/driving/' in js
    assert 'waypoints' in js
    assert 'google.com/maps/dir/?api=1' in js
    assert 'https://waze.com/ul' in js
    assert 'nominatim.openstreetmap.org/search' in js
