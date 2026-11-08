"""Registro voluntário local e exportação GPX com escape XML."""
import json
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public'


def run_node(body):
    r=subprocess.run(['node','-e',body],cwd=ROOT,capture_output=True,text=True,timeout=10)
    assert r.returncode == 0,r.stderr
    return json.loads(r.stdout)


def test_explicit_recording_filters_bad_fixes_and_exports_gpx():
    got=run_node("""
const h=require('./trip-history.js');
const data=new Map(); const store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
const recorder=h.createStore(store);
const empty=recorder.list().length;
recorder.start('Passeio & chuva <DF>',1000);
recorder.addFix({lat:-15.8,lng:-47.9,accuracy:8,speed:5},2000);
recorder.addFix({lat:-15.8,lng:-47.9,accuracy:200,speed:5},3000);
recorder.addFix({lat:-15.8,lng:-47.8996,accuracy:6,speed:8},9000);
recorder.stop(10000);
const trip=recorder.list()[0]; const xml=recorder.toGPX(trip.id);
console.log(JSON.stringify({empty,points:trip.points.length,km:trip.distanceMeters,xml,storeKeys:[...data.keys()]}));
""")
    assert got['empty']==0
    assert got['points']==2
    assert 20 < got['km'] < 80
    assert '&amp;' in got['xml'] and '&lt;DF&gt;' in got['xml']
    assert '<trkpt lat="-15.8" lon="-47.9">' in got['xml']
    assert 'motoradar-trips-v1' in got['storeKeys']


def test_no_implicit_restart_and_deletion():
    got=run_node("""
const h=require('./trip-history.js');const data=new Map();const store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
const first=h.createStore(store);first.start('Teste',1000);first.addFix({lat:-15.8,lng:-47.9,accuracy:5},2000);
const second=h.createStore(store);
const active=second.isRecording();const count=second.list().length;
const trip=second.list()[0];second.erase(trip.id);
console.log(JSON.stringify({active,count,remaining:second.list().length}));
""")
    assert got=={'active':False,'count':1,'remaining':0}
