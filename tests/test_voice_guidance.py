"""Orientações curvas/saídas e antecipações sem mensagens excessivas."""
import subprocess, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]/'public'


def ev(script):
    r=subprocess.run(['node','-e',script],cwd=ROOT,text=True,capture_output=True,timeout=8)
    assert r.returncode==0,r.stderr
    return json.loads(r.stdout)


def test_road_names_and_ramp_destinations():
    v=ev("""
const n=require('./navigation.js');console.log(JSON.stringify({
 r:n.instructionFor({name:'',ref:'DF-003',destinations:'Plano Piloto;Asa Sul',maneuver:{type:'off ramp',modifier:'right'}}),
 round:n.instructionFor({name:'Via L4',maneuver:{type:'roundabout',exit:2}})
}));
""")
    assert 'saída' in v['r'].lower()
    assert 'DF-003' in v['r'] and 'Plano Piloto' in v['r']
    assert 'segunda saída' in v['round']


def test_warning_starts_near_turn_not_many_kilometers_away():
    v=ev("""
const n=require('./navigation.js');let coords=[[-47.90,-15.80],[-47.895,-15.80],[-47.89,-15.80]];
let route={distance:1080,duration:100,geometry:{type:'LineString',coordinates:coords},legs:[{steps:[
 {distance:1080,maneuver:{type:'depart',location:coords[0]},name:'Primeira'},
 {distance:0,maneuver:{type:'turn',modifier:'right',location:coords[2]},name:'Rua B'},
 {distance:0,maneuver:{type:'arrive',location:coords[2]}}
 ]}]};
const s=n.createSession(route,['Destino']);
const a=s.update({lat:-15.8,lng:-47.9,accuracy:6},1000);
const b=s.update({lat:-15.8,lng:-47.895,accuracy:6},3000);
const c=s.update({lat:-15.8,lng:-47.8902,accuracy:6},5000);
console.log(JSON.stringify({a:a.speak,b:b.speak,c:c.speak}));
""")
    assert len(v['a'])==1
    assert any('Rua B' in x for x in v['a'])
    assert len(v['b'])==1
    assert len(v['c'])==1
