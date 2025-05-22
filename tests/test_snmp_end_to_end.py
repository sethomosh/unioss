# tests/test_snmp_end_to_end.py
import os
import subprocess
import time
import requests

BASE_URL = "http://localhost:5000"

def setup_module(module):
    """Bring up the stack once before any tests run."""
    subprocess.run(["docker", "compose", "up", "-d", "--build"], check=True)
    # give services a moment to become healthy
    time.sleep(10)

def teardown_module(module):
    """Tear down the stack after all tests finish."""
    subprocess.run(["docker", "compose", "down"], check=True)

def test_health_endpoint():
    r = requests.get(f"{BASE_URL}/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"

def test_sysdescr():
    params = {"host": "ignored-host"}
    r = requests.get(f"{BASE_URL}/snmp/sysdescr", params=params)
    assert r.status_code == 200
    body = r.json()
    assert "sysdescr" in body
    assert "Simulated SNMP Device" in body["sysdescr"]

def test_sysobjectid():
    params = {"host": "ignored-host"}
    r = requests.get(f"{BASE_URL}/snmp/sysobjectid", params=params)
    assert r.status_code == 200
    body = r.json()
    assert "sysObjectid" in body
    # the simulator returns a “No Such Instance” message
    assert "No Such Instance" in body["sysObjectid"]
