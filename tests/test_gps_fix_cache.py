"""Validação isolada da política de reutilização de fix GPS durante a partida."""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parents[1] / 'public'


def test_recent_fix_uses_device_timestamp_and_accuracy():
    js = r"""
const fs=require('fs');
const source=fs.readFileSync('app.js','utf8');
const begin=source.indexOf('  function recentNavigationGPS(');
const end=source.indexOf('  function startNavigation(){');
if(begin<0||end<=begin)throw Error('Função de cache GPS ausente');
const code=source.slice(begin,end);
const maxAccuracy=Number(source.match(/const GPS_START_ACCURACY_MAX = (\d+)/)?.[1]);
const make=new Function('state','now',`const GPS_START_ACCURACY_MAX=${maxAccuracy};const Date={now:()=>now}; ${code};return (age)=>recentNavigationGPS(age);`);
const gps={coords:{latitude:-15.8,longitude:-48,accuracy:8},timestamp:100000};
const state={gpsPoint:{lat:-15.8,lng:-48},nav:{latestPosition:gps,lastFixAt:100000,lastAccuracy:8}};
const result={
  recent:make(state,120000)(60000)!==null,
  expired:make(state,170001)(60000)===null,
  exactLimit:make(state,160000)(60000)!==null,
  imprecise:make({...state,nav:{...state.nav,lastAccuracy:380}},120000)(60000)===null,
  noFix:make({...state,gpsPoint:null},120000)(60000)===null,
  oldDeviceTime:make({...state,nav:{...state.nav,lastFixAt:170000}},175000)(60000)===null,
  noDeviceTime:make({...state,nav:{...state.nav,latestPosition:{coords:gps.coords}}},120000)(60000)!==null
};
console.log(JSON.stringify(result));
"""
    result=subprocess.run(['node','-e',js],cwd=ROOT,capture_output=True,text=True,timeout=10)
    assert result.returncode==0, result.stderr
    checks=json.loads(result.stdout)
    assert all(checks.values()), checks


def test_gps_acquisition_retries_and_explains_permission_error():
    text=(ROOT/'app.js').read_text()
    assert 'GPS_RETRY_INTERVAL_MS' in text
    assert 'function gpsHealthTick(' in text
    assert 'function gpsWatchStalled(' in text
    assert 'const reference=Math.max(nav.lastWatchStartedAt,nav.lastFixAt||0)' in text
    assert 'O navegador não respondeu ao GPS. Tentando recuperar automaticamente.' in text
    assert 'Localização bloqueada nas permissões do navegador.' in text
    assert 'nav.gpsPermissionDenied=false;' in text
