from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_history_is_opt_in_and_history_script_is_included():
    html=(ROOT/'public/index.html').read_text()
    code=(ROOT/'public/app.js').read_text()
    assert 'trip-history.js?v=10' in html
    assert 'tripRecordBtn' in html and 'tripHistoryBtn' in html and 'historyPanel' in html
    assert 'toggleRecording' in code and 'historyRecorder.addFix' in code
    assert 'finishRecording()' in code
