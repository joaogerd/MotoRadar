from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_radar_corridor_is_explicit_and_experimental():
    html=(ROOT/'public/index.html').read_text()
    app=(ROOT/'public/app.js').read_text()
    assert 'weather-corridor.js?v=15' in html
    for id in ['radarAheadBtn','radarAheadStatus','radarAlertOptIn']:
        assert f'id="{id}"' in html
    assert 'analyzeRadarAhead' in app
    assert 'Mosaico' in app or 'mosaico' in app
