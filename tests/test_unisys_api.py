# tests/test_unisys_api.py
import pytest
from datetime import datetime
import random

# Use the TestClient fixture (provided by tests/conftest.py)
# Tests call `client` directly; no external server required.

def random_ip():
    return f"192.168.{random.randint(0,255)}.{random.randint(1,254)}"

def random_interface():
    return f"eth{random.randint(0,5)}"

@pytest.fixture
def perf_metric():
    return {
        "device_ip": random_ip(),
        "cpu_pct": random.uniform(10, 90),
        "memory_pct": random.uniform(10, 90),
        "uptime_seconds": random.randint(1000, 100000),
        "timestamp": datetime.utcnow().isoformat()
    }

@pytest.fixture
def traffic_metric(perf_metric):
    return {
        "device_ip": perf_metric["device_ip"],
        "interface_name": random_interface(),
        "inbound_kbps": random.uniform(10,1000),
        "outbound_kbps": random.uniform(10,1000),
        "errors": random.randint(0,5),
        "timestamp": datetime.utcnow().isoformat()
    }

# --- SINGLE INSERT TESTS ---
def test_insert_performance(client, perf_metric):
    resp = client.post("/performance", json=perf_metric)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"

def test_insert_traffic(client, traffic_metric):
    resp = client.post("/traffic", json=traffic_metric)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"

# --- BULK INSERT TESTS ---
def test_bulk_inserts(client):
    bulk_perf = []
    bulk_traffic = []
    for _ in range(5):
        ip = random_ip()
        bulk_perf.append({
            "device_ip": ip,
            "cpu_pct": random.uniform(10, 90),
            "memory_pct": random.uniform(10, 90),
            "uptime_seconds": random.randint(1000, 100000),
            "timestamp": datetime.utcnow().isoformat()
        })
        bulk_traffic.append({
            "device_ip": ip,
            "interface_name": random_interface(),
            "inbound_kbps": random.uniform(10,1000),
            "outbound_kbps": random.uniform(10,1000),
            "errors": random.randint(0,5),
            "timestamp": datetime.utcnow().isoformat()
        })

    resp_perf = client.post("/performance/bulk", json=bulk_perf)
    resp_traffic = client.post("/traffic/bulk", json=bulk_traffic)
    assert resp_perf.status_code == 200
    assert resp_traffic.status_code == 200
    assert resp_perf.json()["inserted"] == len(bulk_perf)
    assert resp_traffic.json()["inserted"] == len(bulk_traffic)

# --- GET & FILTER TESTS ---
def test_get_performance(client):
    resp = client.get("/performance", params={"limit":3})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_get_traffic(client):
    resp = client.get("/traffic", params={"limit":3})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)

def test_get_devices_snapshot(client):
    resp = client.get("/devices", params={"limit":3})
    assert resp.status_code == 200
    for dev in resp.json():
        assert "device_ip" in dev
        assert "interfaces" in dev

# --- AGGREGATION TESTS ---
def test_top_cpu_memory(client):
    resp = client.get("/performance/top-cpu")
    assert resp.status_code == 200
    resp = client.get("/performance/top-memory")
    assert resp.status_code == 200

def test_traffic_errors_summary(client):
    resp = client.get("/traffic/errors-summary", params={"min_errors":1})
    assert resp.status_code == 200

def test_top_interfaces(client):
    resp = client.get("/traffic/top-interfaces")
    assert resp.status_code == 200

def test_average_performance(client):
    resp = client.get("/performance/average", params={"period_hours":1})
    assert resp.status_code == 200

def test_total_traffic(client):
    resp = client.get("/traffic/total", params={"period_hours":1})
    assert resp.status_code == 200

def test_traffic_trend(client):
    resp = client.get("/traffic/trend", params={"period_hours":1, "interval_minutes":15})
    assert resp.status_code == 200

def test_devices_dashboard(client):
    resp = client.get("/devices/dashboard", params={"period_hours":1, "interval_minutes":10, "top_interfaces_limit":2})
    assert resp.status_code == 200
    for dev in resp.json():
        assert "device_ip" in dev
        assert "cpu_pct" in dev
        assert "total_inbound" in dev
        assert "traffic_trend" in dev
