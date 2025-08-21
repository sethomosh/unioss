# tests/test_performance.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

sample_metric = {
    "device_ip": "192.168.1.10",
    "cpu_pct": 55.5,
    "memory_pct": 70.2,
    "uptime_seconds": 3600
}

bulk_metrics = [
    {"device_ip": "192.168.1.11", "cpu_pct": 30.0, "memory_pct": 50.0, "uptime_seconds": 1800},
    {"device_ip": "192.168.1.12", "cpu_pct": 40.0, "memory_pct": 60.0, "uptime_seconds": 2400},
]

def test_insert_performance_metric():
    resp = client.post("/performance", json=sample_metric)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

def test_insert_performance_metrics_bulk():
    resp = client.post("/performance/bulk", json=bulk_metrics)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"
    assert resp.json()["inserted"] == len(bulk_metrics)

def test_get_performance_metrics():
    resp = client.get("/performance?limit=5&sort_by=cpu_pct&sort_order=desc")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert all("cpu_pct" in d for d in data)

def test_top_cpu_devices():
    resp = client.get("/performance/top-cpu?limit=3")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert all("max_cpu" in d for d in data)

def test_top_memory_devices():
    resp = client.get("/performance/top-memory?limit=3")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert all("max_memory" in d for d in data)

def test_average_performance_metrics():
    resp = client.get("/performance/average?period_hours=1")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert all("avg_cpu" in d and "avg_memory" in d for d in data)
