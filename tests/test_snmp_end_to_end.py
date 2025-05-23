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
    assert "sysobjectid" in body
    # the simulator returns a “No Such Instance” message
    assert "No Such Instance" in body["sysobjectid"]

def test_sysdescr_custom_community_and_port():
    params = {"host": "ignored-host", "community": "public", "port": 1161}
    r = requests.get(f"{BASE_URL}/snmp/sysdescr", params=params)
    assert r.status_code == 200
    assert "Simulated SNMP Device" in r.json()["sysdescr"]

def test_sysdescr_bad_community():
    params = {
        "host": "ignored-host",
        "community": "wrong-community",
        "port": 1161,
    }
    r = requests.get(f"{BASE_URL}/snmp/sysdescr", params=params)
    # we expect a 502 Bad Gateway to signal upstream SNMP failure
    assert r.status_code == 502
    body = r.json()
    assert "error" in body
    err = body["error"].lower()
    # SNMP sim can return a timeout, auth failure, or noResponse
    assert (
        "timeout" in err
        or "no snmp response" in err
        or "authenticationfailure" in err
        or "noresponse" in err
    )



def test_get_oid_generic():
    params = {
        "host": "ignored-host",
        "oid": "1.3.6.1.2.1.1.1.0",
        "community": "public",
        "port": 1161
    }
    r = requests.get(f"{BASE_URL}/snmp/get", params=params)
    assert r.status_code == 200
    body = r.json()
    assert body["oid"] == params["oid"]
    assert "Simulated SNMP Device" in body["value"]
