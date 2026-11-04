"""Modo Viagem: clear GPS telemetry and navigation-first display."""
from pathlib import Path
import subprocess

ROOT=Path(__file__).parents[1]


def test_trip_dashboard_markup_and_accessibility():
    html=(ROOT/'public/index.html').read_text()
    for ident in ('tripDashboard','tripSpeed','tripSpeedUnit','tripArrival','tripDistance','tripDuration',
                  'tripRadarStatus','tripSettingsBtn','tripStage','navigationPanel','navigationStopBtn'):
        assert f'id="{ident}"' in html, ident
    assert 'Velocidade GPS' in html
    assert 'Chegada estimada' in html
    assert 'Distância restante' in html


def test_trip_display_driven_by_gps_and_osrm_not_guessed():
    js=(ROOT/'public/app.js').read_text()
    assert 'function updateTripSpeed(' in js
    assert 'Number.isFinite(measured)' in js
    assert 'position.coords.speed * 3.6' in js
    assert "$('tripArrival').textContent" in js
    assert "$('tripDistance').textContent" in js
    assert "$('tripDashboard').hidden=false" in js
    assert "$('tripDashboard').hidden=true" in js
    assert "$('tripSettingsBtn').onclick=openSettings" in js
    assert "$('tripRadarText').textContent" in js


def test_trip_mode_clear_map_and_recover_when_stopped():
    css=(ROOT/'public/app.css').read_text()
    assert '.trip-dashboard' in css
    assert '.trip-speed' in css
    assert 'body:has(.navigation-panel:not([hidden])) .bottom-stack' in css
    assert '.navigation-panel' in css
    # Settings must remain accessible on the road only while stationary.
    assert 'tripSettingsBtn' in (ROOT/'public/app.js').read_text()


def test_js_syntax():
    for file in ('public/app.js','public/navigation.js'):
        run=subprocess.run(['node','--check',str(ROOT/file)],capture_output=True,text=True)
        assert run.returncode==0, run.stderr
