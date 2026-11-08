"""Radar histórico: alertas POSITIVOS indicativos; silêncio não significa segurança."""
import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public'

def node(js):
 r=subprocess.run(['node','-e',js],cwd=ROOT,text=True,capture_output=True,timeout=12)
 assert r.returncode==0,r.stderr
 return json.loads(r.stdout)

def test_corridor_samples_and_tile_coordinates():
 data=node("""
const w=require('./weather-corridor.js');const coords=[[-48,-15.8],[-47.9,-15.8]];
const pts=w.sampleForward(coords,{lat:-15.8,lng:-47.99},{metersAhead:12000,stepMeters:2000});
const tile=w.tileFor(pts[0]);console.log(JSON.stringify({length:pts.length,first:pts[0],last:pts.at(-1),tile}));
""")
 assert 5 <= data['length'] <= 7
 assert data['first']['distanceMeters']==0
 assert 0<=data['tile']['x']<128 and 0<=data['tile']['y']<128
 assert 0<=data['tile']['px']<512 and 0<=data['tile']['py']<512


def test_positive_echo_and_unavailable_are_not_false_clear():
 data=node("""
(async()=>{const w=require('./weather-corridor.js');const samples=[{lat:-15.8,lng:-48,distanceMeters:2000},{lat:-15.801,lng:-47.999,distanceMeters:4000}];
const t=w.tileFor(samples[0]);
const echo=await w.scan(samples,async()=>({getPixel:(px,py)=>px===t.px&&py===t.py?[10,60,180,180]:[0,0,0,0]}));
const unknown=await w.scan(samples,async()=>({getPixel:()=>[0,0,0,0]}));
const failure=await w.scan(samples,async()=>{throw Error('CORS')});
console.log(JSON.stringify({echo,unknown,failure}));})();
""")
 assert data['echo']['status']=='echo'
 assert data['echo']['firstDistanceMeters']==2000
 assert data['unknown']['status']=='indeterminate'
 assert data['failure']['status']=='unavailable'


def test_invalid_api_host_rejected():
 data=node("""
const w=require('./weather-corridor.js');console.log(JSON.stringify({bad:w.radarUrl('https://example.com','/v2/radar/1600000000',7,1,2),ok:w.radarUrl('https://tilecache.rainviewer.com','/v2/radar/1600000000',7,1,2)}));
""")
 assert data['bad'] is None
 assert 'rainviewer.com' in data['ok']
