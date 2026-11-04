"""Modo 3D opt-in, com fallback seguro para mapa 2D quando WebGL não existir."""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public'

def node(script):
 r=subprocess.run(['node','-e',script],cwd=ROOT,capture_output=True,text=True,timeout=10)
 assert r.returncode==0,r.stderr
 return json.loads(r.stdout)

def test_3d_adapter_has_pitch_and_follow():
 d=node("""
const m=require('./perspective-map.js');let opts=null,moves=[],removed=false, layers=[];
class Map {constructor(o){opts=o;this.sources=new globalThis.Map();}on(e,f){if(e==='load')f();}addSource(id,v){this.sources.set(id,{setData:data=>{this.lastGeo=data},...v});}getSource(id){return this.sources.get(id)};addLayer(x){layers.push(x.id)};getLayer(id){return layers.includes(id)};getContainer(){return {clientHeight:720}};easeTo(p){moves.push(p)};remove(){removed=true}}
const route={type:'LineString',coordinates:[[-47.9,-15.8],[-47.89,-15.8]]};
const view=m.createView({Map},'some-div',route,{lat:-15.8,lng:-47.9});
view.update({lat:-15.8,lng:-47.899},90);view.destroy();
console.log(JSON.stringify({pitch:opts.pitch,bearing:moves.at(-1).bearing,offset:moves.at(-1).offset,hasRoute:layers.includes('route-line'),removed}));
""")
 assert d['pitch']>=45
 assert d['bearing']==90
 assert d['offset'][1]>0
 assert d['hasRoute'] and d['removed']

def test_mode_is_optional_and_does_not_replace_2d_route():
 html=(ROOT/'index.html').read_text();app=(ROOT/'app.js').read_text()
 assert 'perspective-map.js?v=13' in html
 assert 'perspectiveMap' in html and 'navigation3dBtn' in html
 assert 'togglePerspective' in app
 assert 'L.map(' in app
