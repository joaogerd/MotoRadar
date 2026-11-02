from pathlib import Path
from html.parser import HTMLParser
APP = Path(__file__).parents[1] / 'public' / 'index.html'

class IdParser(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=set()
    def handle_starttag(self, tag, attrs):
        self.ids.update(v for k,v in attrs if k=='id')

def test_search_can_be_triggered_by_user():
    source=APP.read_text(); parser=IdParser();parser.feed(source)
    assert {'destSearch','searchBtn','searchResults'}.issubset(parser.ids)
    assert 'nominatim.openstreetmap.org/search' in source

def test_route_enlarges_map_area():
    source=APP.read_text(); parser=IdParser();parser.feed(source)
    assert {'panelToggle','mapNotice'}.issubset(parser.ids)
    assert 'fitBounds(' in source

def test_manual_select_has_visible_entry_point():
    source=APP.read_text();parser=IdParser();parser.feed(source)
    assert 'pickDestinationBtn' in parser.ids
