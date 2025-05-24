# tests/test_discovery_api.py
import subprocess, time, requests

BASE = "http://localhost:5000"

def setup_module(m):
    subprocess.run(["docker","compose","up","-d","--build"],check=True)
    time.sleep(10)

def teardown_module(m):
    subprocess.run(["docker","compose","down"],check=True)

def test_list_devices():
    r = requests.get(f"{BASE}/api/discovery/devices")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # We expect two entries for 192.168.1.10 and .11:
    ips = {d["ip"] for d in data}
    assert {"192.168.1.10", "192.168.1.11"} <= ips
