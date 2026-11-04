"""Prevent accidental production deploy from non-main branches."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]


def test_ci_has_separate_develop_preview_and_main_release():
    y=(ROOT/'.github/workflows/firebase-hosting.yml').read_text()
    assert "'refs/heads/main'" in y
    assert 'channelId: live' in y
    assert 'name: Prévia Firebase Hosting (develop)' in y
    assert "github.ref == 'refs/heads/develop'" in y
    assert 'channelId: develop' in y
    assert 'needs: tests' in y
    assert "github.event_name != 'pull_request'" in y
