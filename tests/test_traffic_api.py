# tests/test_traffic_api.py
import subprocess, time, requests

BASE = "http://localhost:5000"

def setup_module(m):
    subprocess.run(["docker","compose","up","-d","--build"],check=True)
    time.sleep(10)

def teardown_module(m):
    subprocess.run(["docker","compose","down"],check=True)

def test_list_traffic():
    r = requests.get(f"{BASE}/api/traffic/interfaces")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Should include at least one entry for each interface
    idxs = {t["interface_index"] for t in data}
    assert {1, 2} <= idxs
    for t in data:
        assert "inbound_kbps" in t and "outbound_kbps" in t
