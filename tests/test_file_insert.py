# tests/test_file_insert.py
import pytest
from unittest.mock import patch
from datetime import datetime
from app.main import (
    insert_performance_metric,
    PerformanceMetricIn,
)

# simulate a file-based edge case (e.g., reading from a CSV)
def mock_file_metrics():
    return [
        PerformanceMetricIn(
            device_ip="10.0.0.1",
            cpu_pct=10.0,
            memory_pct=20.0,
            uptime_seconds=100
        ),
        PerformanceMetricIn(
            device_ip="10.0.0.2",
            cpu_pct=15.0,
            memory_pct=25.0,
            uptime_seconds=200
        ),
    ]


@patch("app.main.run_query")
def test_file_insert(mock_run_query):
    mock_run_query.return_value = 1
    metrics = mock_file_metrics()
    results = []
    for metric in metrics:
        resp = insert_performance_metric(metric)
        results.append(resp)
    assert all(r["status"] == "success" for r in results)
    assert mock_run_query.call_count == len(metrics)
