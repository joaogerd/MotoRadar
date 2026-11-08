import json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public'

def run(js):
 r=subprocess.run(['node','-e',js],cwd=ROOT,text=True,capture_output=True,timeout=10)
 assert r.returncode==0,r.stderr
 return json.loads(r.stdout)

def test_query_is_bounded_and_rejects_unknown_categories():
 x=run("""
const m=require('./smart-stops.js');
console.log(JSON.stringify({q:m.buildQuery({lat:-15.8,lng:-47.9},'fuel',3000),bad:(()=>{try{m.buildQuery({lat:-15.8,lng:-47.9},'unsafe',5000);return false}catch(e){return true}})()}));
""")
 assert 'around:3000' in x['q']
 assert 'amenity=fuel' in x['q']
 assert '[timeout:12]' in x['q']
 assert x['bad'] is True

def test_results_filter_coordinates_and_sort_distance():
 x=run("""
const m=require('./smart-stops.js');const raw={elements:[
 {id:1,type:'node',lat:-15.9,lon:-47.9,tags:{name:'Longe',amenity:'fuel'}},
 {id:2,type:'way',center:{lat:-15.8001,lon:-47.9},tags:{name:'Perto',amenity:'fuel'}},
 {id:3,type:'node',lat:999,lon:0,tags:{name:'Invalido',amenity:'fuel'}}]};
console.log(JSON.stringify(m.normalize(raw,{lat:-15.8,lng:-47.9}).map(x=>x.name)));
""")
 assert x==['Perto','Longe']
