# tests/test_edge_cases.py
import pytest
from unittest.mock import patch
from datetime import datetime
from app.main import (
    insert_performance_metric,
    insert_traffic_metric,
    insert_performance_metrics_bulk,
    insert_traffic_metrics_bulk,
    PerformanceMetricIn,
    TrafficMetricIn
)


# --- single performance insert ---
@patch("app.main.run_query")
def test_insert_performance_metric(mock_run_query):
    mock_run_query.return_value = 1  # simulate successful insert
    metric = PerformanceMetricIn(
        device_ip="10.0.0.1",
        cpu_pct=25.5,
        memory_pct=60.0,
        uptime_seconds=3600,
        timestamp=datetime.utcnow()
    )
    resp = insert_performance_metric(metric)
    assert resp["status"] == "success"
    mock_run_query.assert_called_once()


# --- single traffic insert ---
@patch("app.main.run_query")
def test_insert_traffic_metric(mock_run_query):
    mock_run_query.return_value = 1
    metric = TrafficMetricIn(
        device_ip="10.0.0.1",
        interface_name="eth0",
        inbound_kbps=100.0,
        outbound_kbps=50.0,
        errors=0,
        timestamp=datetime.utcnow()
    )
    resp = insert_traffic_metric(metric)
    assert resp["status"] == "success"
    mock_run_query.assert_called_once()


# --- bulk performance insert ---
@patch("app.main.run_query")
def test_insert_performance_metrics_bulk(mock_run_query):
    mock_run_query.return_value = 2  # simulate two rows inserted
    metrics = [
        PerformanceMetricIn(
            device_ip="10.0.0.1",
            cpu_pct=20.0,
            memory_pct=50.0,
            uptime_seconds=3600
        ),
        PerformanceMetricIn(
            device_ip="10.0.0.2",
            cpu_pct=30.0,
            memory_pct=70.0,
            uptime_seconds=7200
        )
    ]
    resp = insert_performance_metrics_bulk(metrics)
    assert resp["status"] == "success"
    assert resp["inserted"] == len(metrics)
    mock_run_query.assert_called_once()


# --- bulk traffic insert ---
@patch("app.main.run_query")
def test_insert_traffic_metrics_bulk(mock_run_query):
    mock_run_query.return_value = 2
    metrics = [
        TrafficMetricIn(
            device_ip="10.0.0.1",
            interface_name="eth0",
            inbound_kbps=100,
            outbound_kbps=50,
            errors=0
        ),
        TrafficMetricIn(
            device_ip="10.0.0.2",
            interface_name="eth1",
            inbound_kbps=200,
            outbound_kbps=100,
            errors=1
        )
    ]
    resp = insert_traffic_metrics_bulk(metrics)
    assert resp["status"] == "success"
    assert resp["inserted"] == len(metrics)
    mock_run_query.assert_called_once()
