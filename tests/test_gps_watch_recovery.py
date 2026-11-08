"""Regression tests for watchPosition failures on Android and local diagnostics."""
import json
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]/"public"


def test_watch_position_failure_is_released_and_can_restart():
    js=r"""
const fs=require('fs');
const source=fs.readFileSync('app.js','utf8');
function section(a,b){
 const i=source.indexOf(a),j=source.indexOf(b,i);
 if(i<0||j<=i)throw Error('section missing '+a);
 return source.slice(i,j);
}
const gps=section('  function releaseGpsWatch(){','  function updateGPS(pos){');
const enable=section('  function enableGPS(useAsOrigin=false){','  function initMap(){');
const state={
 gpsWatch:null,gpsWatchGeneration:0,gpsPoint:null,
 nav:{active:false,waiting:false,building:false,gpsPermissionDenied:false,lastWatchStartedAt:0,
      lastGpsError:'',lastGpsErrorAt:0,lastFixAt:0,lastAccuracy:undefined}
};
const callbacks=[],cleared=[];let watches=0, updates=0;
const navigator={geolocation:{
 watchPosition(success,error,options){
  callbacks.push({success,error,options});return ++watches;
 },
 clearWatch(id){cleared.push(id)}
}};
const window={isSecureContext:true};
const controls={
 gpsDiagnostics:{textContent:''},
 navigationInstruction:{textContent:'Aguardando GPS'},
 navigationGpsState:{textContent:''}
};
const $=(id)=>controls[id]||{textContent:''};
const location={hostname:'preview.exemplo'};
const factory=new Function('state','navigator','window','toast','navigationStatus','
api.enableGPS(false);
callbacks[0].error({code:3});
const released=state.gpsWatch===null && cleared.join()==='1' && state.nav.lastGpsError==='Tempo de aquisição esgotado';
api.enableGPS(false);
callbacks[0].success({coords:{latitude:1,longitude:2,accuracy:8}});
const staleIgnored=updates===0;
callbacks[1].success({coords:{latitude:1,longitude:2,accuracy:8}});
const currentAccepted=updates===1;
const diagnostic=api.gpsDiagnosticsText();
const privateDiagnostic=!diagnostic.includes('latitude')&&!diagnostic.includes('longitude')&&!diagnostic.includes('1,2');
callbacks[1].error({code:1});
console.log(JSON.stringify({released,staleIgnored,currentAccepted,restarted:watches===2,
  permissionDenied:state.nav.gpsPermissionDenied&&state.gpsWatch===null,privateDiagnostic}));
"""
    result=subprocess.run(["node","-e",js],cwd=ROOT,capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
    checks=json.loads(result.stdout)
    assert all(checks.values()), checks


def test_diagnostics_present_and_navigation_low_accuracy_has_no_nan_eta():
    app=(ROOT/"app.js").read_text()
    html=(ROOT/"index.html").read_text()
    assert 'id="gpsDiagnostics"' in html
    assert 'id="gpsDiagnosticCopyBtn"' in html
    assert 'GPS_START_ACCURACY_MAX = 300' in app
    assert "const readable=mins===null?'—'" in app
    assert "nav.needsPreciseReanchor=false" in app
    assert "GPS_WATCH_RETRY_MS" in app
    assert "gpsDiagnosticsText()" in app
,'setFollow','updateGPS','location',
 'checkGpsPermission','gpsWatchStalled','GPS_DIAGNOSTIC_VERSION','document',
 gps+'\n'+enable+'\nreturn {enableGPS,releaseGpsWatch,gpsError,gpsDiagnosticsText};');
const api=factory(state,navigator,window,()=>{},()=>{},$,()=>{},()=>{updates++},location,
 ()=>{},()=>false,'v22',{visibilityState:'visible'});
api.enableGPS(false);
callbacks[0].error({code:3});
const released=state.gpsWatch===null && cleared.join()==='1' && state.nav.lastGpsError==='Tempo de aquisição esgotado';
api.enableGPS(false);
callbacks[0].success({coords:{latitude:1,longitude:2,accuracy:8}});
const staleIgnored=updates===0;
callbacks[1].success({coords:{latitude:1,longitude:2,accuracy:8}});
const currentAccepted=updates===1;
const diagnostic=api.gpsDiagnosticsText();
const privateDiagnostic=!diagnostic.includes('latitude')&&!diagnostic.includes('longitude')&&!diagnostic.includes('1,2');
callbacks[1].error({code:1});
console.log(JSON.stringify({released,staleIgnored,currentAccepted,restarted:watches===2,
  permissionDenied:state.nav.gpsPermissionDenied&&state.gpsWatch===null,privateDiagnostic}));
"""
    result=subprocess.run(["node","-e",js],cwd=ROOT,capture_output=True,text=True,timeout=10)
    assert result.returncode==0,result.stderr
    checks=json.loads(result.stdout)
    assert all(checks.values()), checks


def test_diagnostics_present_and_navigation_low_accuracy_has_no_nan_eta():
    app=(ROOT/"app.js").read_text()
    html=(ROOT/"index.html").read_text()
    assert 'id="gpsDiagnostics"' in html
    assert 'id="gpsDiagnosticCopyBtn"' in html
    assert 'GPS_START_ACCURACY_MAX = 300' in app
    assert "const readable=mins===null?'—'" in app
    assert "nav.needsPreciseReanchor=false" in app
    assert "GPS_WATCH_RETRY_MS" in app
    assert "gpsDiagnosticsText()" in app
