"""Assets replaced in a release must use one new revision in the HTML."""
from pathlib import Path
import re
ROOT=Path(__file__).parents[1]/'public'


def test_app_assets_share_explicit_release_version():
    doc=(ROOT/'index.html').read_text()
    files=['app.js','navigation.js','app.css','trip-history.js','offline-route.js','smart-stops.js','weather-corridor.js','echo-motion.js','perspective-map.js']
    versions=[]
    for name in files:
        match=re.findall(r'["\']'+re.escape(name)+r'\?v=(\d+)["\']',doc)
        assert len(match)==1, f'{name} precisa de uma URL de versão única'
        versions.append(match[0])
    assert len(set(versions))==1, f'cache inconsistente: {dict(zip(files,versions))}'
    assert int(versions[0])>=9
