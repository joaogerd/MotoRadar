"""Historical echo motion: experimental and never forecast precipitation."""
import json, subprocess
from pathlib import Path
ROOT=Path(__file__).parents[1]/'public'


def node(script):
    p=subprocess.run(['node','-e',script],cwd=ROOT,text=True,capture_output=True,timeout=15)
    assert p.returncode==0,p.stderr
    return json.loads(p.stdout)


def test_bearing_speed_and_confidence_from_shifted_cells():
    d=node('''
const m=require('./echo-motion.js');
const size=96,a=new Uint8Array(size*size),b=new Uint8Array(size*size);
for(let y=19;y<28;y++)for(let x=22;x<33;x++){if((x*3+y*5)%11!==0){a[y*size+x]=255;b[(y+2)*size+x+3]=255;}}
const result=m.estimate(a,b,{width:size,height:size,step:1,maxShift:7,frameSeconds:600,latitude:-15.8,zoom:7,tileSize:512});
console.log(JSON.stringify(result));
''')
    assert d['status']=='motion',d
    assert 110<d['bearingDeg']<140,d
    assert d['dxPixels']==3 and d['dyPixels']==2,d
    assert d['speedKmH']>1,d
    assert d['confidence']>0.6,d


def test_motion_does_not_invent_result_when_data_insufficient():
    d=node('''
const m=require('./echo-motion.js');
const size=64,a=new Uint8Array(size*size),b=new Uint8Array(size*size);
a[2]=255;b[3]=255;
console.log(JSON.stringify({empty:m.estimate(new Uint8Array(size*size),new Uint8Array(size*size),{width:size,height:size}),sparse:m.estimate(a,b,{width:size,height:size}),invalid:m.estimate(a,b,{width:size,height:size,frameSeconds:0})}));
''')
    assert d['empty']['status']=='unavailable'
    assert d['sparse']['status']=='unavailable'
    assert d['invalid']['status']=='unavailable'


def test_reading_browser_tiles_requires_cors_and_is_manual_only():
    src=(ROOT/'echo-motion.js').read_text()
    assert 'loadBrowserTile' in src
    assert 'createImageData' not in src
    html=(ROOT/'index.html').read_text()
    assert 'radarMotionBtn' in html
    assert 'radarMotionStatus' in html
    assert "echo-motion.js?v=16" in html
    app=(ROOT/'app.js').read_text()
    assert 'MotoEchoMotion.analyzeFrames' in app
