"""Regression coverage for MotoRadar first-fix deadlock and GPS/UI isolation."""
from pathlib import Path
import json
import subprocess

ROOT=Path(__file__).resolve().parents[1]/"public"


def run_node(script):
    result=subprocess.run(["node","-e",script],cwd=ROOT,capture_output=True,text=True,timeout=15)
    assert result.returncode==0,result.stderr
    return json.loads(result.stdout)


def test_first_fix_watchdog_recovers_silent_browser():
    results=run_node(r"""
const fs=require('fs'),source=fs.readFileSync('app.js','utf8');
function between(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);
 if(i<0||j<=i)throw Error('No section '+a);return source.slice(i,j);}
const watch=between('  function gpsWatchStalled(', '  async function checkGpsPermission(');
const health=between('  function gpsHealthTick(', '  // MapLibre v6 usa módulos');
const clock={now:0};
const calls={restart:0,release:0,probe:0,status:[]};
const state={gpsWatch:77,origin:{gps:false},follow:true,nav:{
  waiting:true,active:false,gpsPermissionDenied:false,lastWatchStartedAt:10000,
  lastFixAt:0,lastGpsAttemptAt:0,gpsRequestPending:false,gpsWatchRestarts:0,
  lastGpsError:'',lastGpsErrorAt:0}};
const document={visibilityState:'visible'};
const fn=new Function('state','document','enableGPS','releaseGpsWatch',
  'requestFreshNavigationGPS','gpsAcquisitionStatus','navigationStatus','$',
  'updateGpsDiagnostics','GPS_STALL_MS','GPS_WATCH_RETRY_MS',
  'GPS_INITIAL_PROBE_DELAY_MS','GPS_RETRY_INTERVAL_MS',
  watch+health+'return {gpsHealthTick,gpsWatchStalled};');
const engine=fn(state,document,()=>{calls.restart++;state.gpsWatch=78;state.nav.lastWatchStartedAt=clock.now;},
  ()=>{calls.release++;state.gpsWatch=null;},()=>{calls.probe++;state.nav.lastGpsAttemptAt=clock.now;},
  m=>calls.status.push(m),m=>calls.status.push(m),()=>({textContent:''}),
  ()=>{},30000,12000,6500,16000);
clock.now=18000;engine.gpsHealthTick(clock.now);
const probeBeforeFirstFix=calls.probe===1 && calls.restart===0;
clock.now=41000;engine.gpsHealthTick(clock.now);
const restartedWithoutInitialFix=calls.restart===1&&calls.release===1&&state.nav.gpsWatchRestarts===1;
state.nav.lastFixAt=42000;
clock.now=55000;engine.gpsHealthTick(clock.now);
const recentFixDoesNotRestart=calls.restart===1;
document.visibilityState='hidden';clock.now=100000;engine.gpsHealthTick(clock.now);
const hiddenDoesNotRestart=calls.restart===1;
console.log(JSON.stringify({probeBeforeFirstFix,restartedWithoutInitialFix,
 recentFixDoesNotRestart,hiddenDoesNotRestart}));
""")
    assert all(results.values()),results


def test_oneshot_deadline_releases_pending_state_without_browser_callback():
    results=run_node(r"""
const fs=require('fs'),source=fs.readFileSync('app.js','utf8');
function between(a,b){const i=source.indexOf(a),j=source.indexOf(b,i);
 if(i<0||j<=i)throw Error('No section '+a);return source.slice(i,j);}
const cancel=between('  function cancelPendingGpsProbe()', '  function gpsWatchStalled(');
const request=between('  function requestFreshNavigationGPS()', '  function gpsHealthTick(');
const timers=[],callbacks=[],fixes=[];
const state={gpsWatch:8,follow:true,nav:{
  waiting:true,active:false,building:false,gpsRequestPending:false,
  gpsPermissionDenied:false,gpsRequestSerial:0,lastGpsAttemptAt:0,
  gpsRequestTimer:null,gpsOneShotAttempts:0,gpsOneShotErrors:0,lastGpsError:''}};
const navigator={geolocation:{getCurrentPosition:(ok,fail,opts)=>{
 callbacks.push({ok,fail,opts});}}};
const now={now:()=>100000};
const factory=new Function('state','navigator','Date','setTimeout','clearTimeout',
  'navigationStatus','$','updateGPS','gpsAcquisitionStatus',
  'GPS_ONE_SHOT_TIMEOUT_MS',cancel+request+
  'return {requestFreshNavigationGPS,cancelPendingGpsProbe};');
const api=factory(state,navigator,now,(fn,ms)=>{timers.push({fn,ms});return timers.length;},
 ()=>{},()=>{},()=>({textContent:''}),p=>fixes.push(p),()=>{},15000);
api.requestFreshNavigationGPS();
const pending=state.nav.gpsRequestPending && callbacks.length===1 && timers[0].ms===15000;
timers[0].fn();
const recovered=!state.nav.gpsRequestPending&&state.nav.gpsOneShotErrors===1;
callbacks[0].ok({coords:{latitude:1,longitude:2}}); // Late callback ignored
const lateIgnored=fixes.length===0;
api.requestFreshNavigationGPS();
callbacks[1].ok({coords:{latitude:1,longitude:3}});
const retryWorks=fixes.length===1&&!state.nav.gpsRequestPending&&state.nav.gpsOneShotAttempts===2;
console.log(JSON.stringify({pending,recovered,lateIgnored,retryWorks}));
""")
    assert all(results.values()),results


def test_visual_error_cannot_hide_received_gps_fix():
    results=run_node(r"""
const fs=require('fs'),source=fs.readFileSync('app.js','utf8');
const a=source.indexOf('  function updateGPS(pos,source=');
const b=source.indexOf('  function enableGPS(',a);
if(a<0||b<a)throw Error('updateGPS missing');
const code=source.slice(a,b);
const state={gpsPoint:null,nav:{active:false,waiting:true,gpsRequestPending:false,
 gpsPermissionDenied:false,gpsWatchFixes:0,invalidFixes:0,lastFixAt:0,lastRenderError:'',
 lastNavigationError:''}};
const L={latLng:(lat,lng)=>({lat,lng}),divIcon:()=>{throw Error('render simulator fault')}};
const window={MotoNavigation:null};
const weatherMonitor={optedIn:false};
let updates=0;
const fn=new Function('state','L','window','historyRecorder','weatherMonitor',
 'gpsFixAge','GPS_FIX_MAX_AGE_MS','cancelPendingGpsProbe',
 'handleNavPosition','updateGpsDiagnostics','$','renderPins','analyzeRadarAhead',
 code+'return updateGPS;');
const update=fn(state,L,window,null,weatherMonitor,
 p=>Math.max(0,Date.now()-p.timestamp),60000,()=>{},()=>updates++,
 ()=>{},()=>({hidden:true}),()=>{},()=>{});
const fresh={timestamp:Date.now(),coords:{latitude:-15.8,longitude:-48,accuracy:10,
 speed:0,heading:null}};
update(fresh,'monitoramento');
const acceptedDespiteRenderFailure=state.nav.lastFixAt>0 && !!state.nav.latestPosition &&
 state.nav.lastRenderError.includes('simulator')&&updates===1;
const first=state.nav.lastFixAt;
update({...fresh,timestamp:Date.now()-90000});
const rejectsOldCachedFix=state.nav.lastFixAt===first&&state.nav.invalidFixes===1;
console.log(JSON.stringify({acceptedDespiteRenderFailure,rejectsOldCachedFix}));
""")
    assert all(results.values()),results
