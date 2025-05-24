# tests/test_performance_api.py
import subprocess, time, requests

BASE = "http://localhost:5000"

def setup_module(m):
    subprocess.run(["docker","compose","up","-d","--build"],check=True)
    time.sleep(10)

def teardown_module(m):
    subprocess.run(["docker","compose","down"],check=True)

def test_list_performance():
    r = requests.get(f"{BASE}/api/performance/devices")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    # Check that each record has our two IPs and numeric cpu/memory/uptime
    ips = {p["ip"] for p in data}
    assert {"192.168.1.10", "192.168.1.11"} <= ips
    for p in data:
        assert "cpu" in p and "memory" in p and "uptime" in p
