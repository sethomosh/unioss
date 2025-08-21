# tests/test_traffic.py
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app

client = TestClient(app)

# sample payloads
single_metric = {
    "device_ip": "192.168.1.1",
    "interface_name": "eth0",
    "inbound_kbps": 100.5,
    "outbound_kbps": 200.3,
    "errors": 2
}

bulk_metrics = [
    {
        "device_ip": "192.168.1.1",
        "interface_name": "eth0",
        "inbound_kbps": 100.5,
        "outbound_kbps": 200.3,
        "errors": 2
    },
    {
        "device_ip": "192.168.1.2",
        "interface_name": "eth1",
        "inbound_kbps": 50.0,
        "outbound_kbps": 75.0,
        "errors": 0
    }
]

# --- POST /traffic ---
@patch("app.main.run_query")
def test_insert_traffic_metric(mock_run):
    mock_run.return_value = 1
    response = client.post("/traffic", json=single_metric)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

# --- POST /traffic/bulk ---
@patch("app.main.run_query")
def test_insert_traffic_metrics_bulk(mock_run):
    mock_run.return_value = 2
    response = client.post("/traffic/bulk", json=bulk_metrics)
    assert response.status_code == 200
    assert response.json()["inserted"] == len(bulk_metrics)

# --- GET /traffic ---
@patch("app.main.run_query")
def test_get_traffic_metrics(mock_run):
    mock_run.return_value = [
        {**single_metric, "timestamp": "2025-08-20T09:00:00"}
    ]
    response = client.get("/traffic")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert data[0]["device_ip"] == single_metric["device_ip"]

# --- GET /traffic/errors-summary ---
@patch("app.main.run_query")
def test_traffic_errors_summary(mock_run):
    mock_run.return_value = [
        {"device_ip": "192.168.1.1", "total_errors": 2, "interfaces_with_errors": 1}
    ]
    response = client.get("/traffic/errors-summary?min_errors=1")
    assert response.status_code == 200
    assert response.json()[0]["total_errors"] >= 1

# --- GET /traffic/top-interfaces ---
@patch("app.main.run_query")
def test_top_traffic_interfaces(mock_run):
    mock_run.return_value = [
        {"device_ip": "192.168.1.1", "interface_name": "eth0", "total_kbps": 300.8}
    ]
    response = client.get("/traffic/top-interfaces?limit=1")
    assert response.status_code == 200
    assert response.json()[0]["total_kbps"] == 300.8

# --- GET /traffic/total ---
@patch("app.main.run_query")
def test_total_traffic_metrics(mock_run):
    mock_run.return_value = [
        {"device_ip": "192.168.1.1", "total_inbound": 100, "total_outbound": 200, "total_errors": 2}
    ]
    response = client.get("/traffic/total?period_hours=1")
    assert response.status_code == 200
    totals = response.json()[0]
    assert totals["total_inbound"] >= 0
