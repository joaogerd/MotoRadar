"""Regression checks for MotoRadar's approved navigation design v13."""
from pathlib import Path
import re

ROOT = Path(__file__).parents[1] / "public"


def test_original_brand_and_bold_turn_maneuver_symbols():
    html = (ROOT / "index.html").read_text()
    logo = (ROOT / "icon.svg").read_text()
    css = (ROOT / "app.css").read_text()
    assert 'class="nav-brand"' in html
    assert 'class="brand-wordmark"' in html
    assert 'mr-turn-left-solid' in html
    assert 'mr-turn-right-solid' in html
    assert 'mr-turn-straight-solid' in html
    assert '#mr-turn-left-solid' in html
    assert 'navigationArrow' in html
    assert 'nav-arrow-svg' in css
    assert 'fill:currentColor' in css
    assert 'viewBox="0 0 512 512"' in logo
    assert 'road' in logo.lower()


def test_dashboard_has_two_by_two_readable_metrics():
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "app.css").read_text()
    assert len(re.findall(r'class="[^"]*\\btrip-metric\\b', html)) == 4
    assert 'class="metric-value"' in html
    assert 'mr-speed-solid' in html
    assert 'mr-route-solid' in html
    assert 'mr-flag-solid' in html
    assert 'mr-timer-solid' in html
    assert 'grid-template-columns:repeat(2,minmax(0,1fr))' in css
    assert 'tripPanelToggleBtn' in html
    assert '.trip-dashboard.compact' in css
    assert 'tripCompactCenterBtn' in html


def test_actions_are_consistent_and_keep_all_functionality():
    html = (ROOT / "index.html").read_text()
    css = (ROOT / "app.css").read_text()
    for item in ("navigation3dBtn", "navigationFullscreenBtn", "navigationCenterBtn",
                 "navigationVoiceBtn", "tripRecordBtn", "navigationStopBtn", "tripSettingsBtn"):
        assert html.count('id="' + item + '"') == 1
    for label in ("Centralizar", "Voz", "Gravar", "Encerrar viagem", "Radar e clima"):
        assert label in html
    assert 'mr-record-solid' in html
    assert 'mr-voice-solid' in html
    assert 'mr-target-solid' in html
    assert 'mr-layer-solid' in html
    assert 'min-height:48px' in css
    assert 'max-height:650px' in css


def test_release_cache_bumped_consistently():
    html = (ROOT / "index.html").read_text()
    assert 'app.css?v=13' in html
    assert 'app.js?v=13' in html
    assert 'motoradar-shell-v14' in (ROOT / "sw.js").read_text()


def test_record_button_preserves_visual_identity_when_toggled():
    js=(ROOT / "app.js").read_text()
    assert "function setRecordingButton(" in js
    assert "setRecordingButton(true)" in js
    assert "setRecordingButton(false)" in js
    assert "tripRecordBtn').textContent" not in js
