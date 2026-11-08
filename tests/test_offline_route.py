"""Cache local de geometria de rota, sem baixar tiles OSM."""
import subprocess,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public'

def n(js):
 r=subprocess.run(['node','-e',js],cwd=ROOT,capture_output=True,text=True,timeout=10)
 assert r.returncode == 0,r.stderr
 return json.loads(r.stdout)

def test_route_cache_matches_waypoints_and_expires():
 o=n("""
const o=require('./offline-route.js');const m=new Map();const st={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};
const pts=[{lat:-15.8,lng:-47.9},{lat:-15.9,lng:-47.8}];const route={distance:1000,duration:100,geometry:{type:'LineString',coordinates:[[-47.9,-15.8],[-47.8,-15.9]]},legs:[{steps:[]}]};
console.log(JSON.stringify({saved:o.save(st,pts,route,1000),hit:o.load(st,pts,2000)?.distance,miss:o.load(st,[pts[1],pts[0]],2000),expired:o.load(st,pts,1000+8*24*3600*1000)}));
""")
 assert o=={'saved':True,'hit':1000,'miss':None,'expired':None}

def test_service_worker_must_not_prefetch_osm_tiles():
 js=(ROOT/'sw.js').read_text()
 assert 'tile.openstreetmap.org' not in js
 assert 'caches.open' in js
