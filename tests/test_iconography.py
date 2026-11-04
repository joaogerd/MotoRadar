"""Regression checks for rounded in-app SVG iconography (versioned UI)."""
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

class IconParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.symbols = set()
        self.uses = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'symbol': self.symbols.add(d.get('id'))
        if tag == 'use': self.uses.append(d.get('href'))


def test_svg_icons_reference_local_sprite_without_new_cdn():
    html = (ROOT / 'public/index.html').read_text()
    parser = IconParser()
    parser.feed(html)
    assert {'mr-settings', 'mr-route', 'mr-turn-right', 'mr-turn-left',
            'mr-turn-straight', 'mr-voice-on', 'mr-voice-off', 'mr-locate',
            'mr-search', 'mr-fullscreen', 'mr-roundabout'} <= parser.symbols
    assert parser.uses
    assert all(ref and ref.startswith('#mr-') and ref[1:] in parser.symbols
               for ref in parser.uses)
    assert 'navigationArrow' in html and 'nav-arrow-svg' in html


def test_navigation_dynamic_arrows_voice_and_stop_controls_are_svg():
    code = (ROOT / 'public/app.js').read_text()
    assert 'navIconName' in code and "'↱':'turn-right-solid'" in code
    assert "$('navigationArrow').innerHTML=svgIcon(" in code
    assert 'setVoiceButton()' in code
    assert 'navigationVoiceBtn' in code
    assert 'mr-chevron-down' in (ROOT / 'public/index.html').read_text()
    css = (ROOT / 'public/app.css').read_text()
    assert 'stroke-linecap:round' in css and 'stroke-width:2.35' in css
    assert '.nav-arrow-svg' in css


def test_icon_asset_release_is_versioned():
    html = (ROOT / 'public/index.html').read_text()
    assert 'app.css?v=15' in html and 'app.js?v=15' in html
    assert 'motoradar-shell-v16' in (ROOT / 'public/sw.js').read_text()

def test_navigation_visual_system_v11():
    html=(ROOT/'public/index.html').read_text()
    css=(ROOT/'public/app.css').read_text()
    app=(ROOT/'public/app.js').read_text()
    for name in ('mr-icon-3d','mr-speed','mr-timer','mr-turn-keep-right','mr-poi-hospital','mr-poi-rain'):
        assert name in html
    assert 'gps-bike' in app
    assert '--mr-navy:#092650' in css
    assert 'tripRadarText' in html and "('tripRadarText').textContent" in app
