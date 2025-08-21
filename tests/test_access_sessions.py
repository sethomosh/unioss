# tests/test_access_sessions.py

import subprocess
import time
import requests

BASE_URL = "http://localhost:5000"

def setup_module(module):
    """Bring up the full stack before any tests run."""
    subprocess.run(["docker", "compose", "up", "-d", "--build"], check=True)
    time.sleep(5)  # give services a moment

def teardown_module(module):
    """Tear down the stack after all tests finish."""
    subprocess.run(["docker", "compose", "down"], check=True)

def test_list_sessions():
    r = requests.get(f"{BASE_URL}/api/access/sessions")
    assert r.status_code == 200

    sessions = r.json()
    # Should be a list of two session dicts (per your stub)
    assert isinstance(sessions, list)
    assert len(sessions) == 2

    # Validate keys and example values
    first = sessions[0]
    expected_keys = {
        "user", "ip", "mac", "login_time", "logout_time",
        "duration", "authenticated_via"
    }
    assert set(first.keys()) == expected_keys

    # Check values match the stub
    assert first["user"] == "alice"
    assert first["ip"] == "192.168.1.10"
    assert first["authenticated_via"] == "snmp"
    # logout_time and duration may be None
    assert first["logout_time"] is None
    assert first["duration"] is None

    second = sessions[1]
    assert second["user"] == "bob"
    assert second["duration"] == 1800



