"""Ajuste visual da moto à polilinha: o GPS verdadeiro permanece intacto."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'public'


def node_eval(body):
    run = subprocess.run(['node', '-e', body], cwd=ROOT, text=True, capture_output=True, timeout=10)
    assert run.returncode == 0, run.stderr
    return json.loads(run.stdout)


def test_snap_on_route_only_with_good_accuracy_and_heading():
    data = node_eval("""
const n = require('./navigation.js');
const coords = [[-47.9,-15.8],[-47.89,-15.8]];
const pt = {lat:-15.80006,lng:-47.895};
console.log(JSON.stringify({
  ok:n.snapForDisplay(pt,coords,{accuracy:9,heading:90,speed:10}),
  opposite:n.snapForDisplay(pt,coords,{accuracy:9,heading:270,speed:10}),
  poor:n.snapForDisplay(pt,coords,{accuracy:120,heading:90,speed:10}),
  far:n.snapForDisplay({lat:-15.805,lng:-47.895},coords,{accuracy:8,heading:90,speed:10})
}));
""")
    assert data['ok']['matched'] is True
    assert abs(data['ok']['point']['lat'] + 15.8) < 1e-6
    assert data['opposite']['matched'] is False
    assert data['poor']['matched'] is False
    assert data['far']['matched'] is False


def test_no_route_returns_raw_point():
    data = node_eval("""
const n=require('./navigation.js');
const p={lat:-15.8,lng:-47.9};
console.log(JSON.stringify(n.snapForDisplay(p,[],{accuracy:7})));
""")
    assert data['matched'] is False
    assert data['point']=={'lat':-15.8,'lng':-47.9}
