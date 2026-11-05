"""O Modo Viagem deve iniciar com zoom GPS e visualização preferida."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/"public"


def test_initial_view_setting_and_persistence_contract():
    html=(ROOT/"index.html").read_text()
    app=(ROOT/"app.js").read_text()
    assert 'id="navigationViewPreference"' in html
    assert 'value="2.5d" selected' in html
    assert 'value="2d"' in html
    assert "motoradar-navigation-view-v1" in app
    assert "restoreNavigationViewPreference()" in app
    assert "saveNavigationViewPreference(" in app
    assert "setNavigationPerspective(" in app


def test_zoom_to_current_gps_before_routing_and_safe_default():
    app=(ROOT/"app.js").read_text()
    assert "const NAV_ZOOM = 17" in app
    assert "function zoomToStartGPS(" in app
    assert "map.flyTo(current,NAV_ZOOM" in app
    assert "zoomToStartGPS(current)" in app
    assert "setNavigationPerspective(navigationViewPreference,false)" in app
    assert "nav.lastAccuracy<=100" in app
    assert "Math.max(NAV_ZOOM,map.getZoom())" in app


def test_auto_perspective_keeps_full_map_layers():
    css=(ROOT/"app.css").read_text()
    app=(ROOT/"app.js").read_text()
    assert "#map.mr-pseudo3d" in css
    assert "pseudo3d=!!enabled" in app
    assert "disablePerspective()" in app
    assert "navigator.geolocation.watchPosition" in app
