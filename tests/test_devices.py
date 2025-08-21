# tests/test_devices.py
import pytest
from httpx import AsyncClient
from httpx import ASGITransport
from datetime import datetime, timedelta
from app.main import app

transport = ASGITransport(app=app)

@pytest.mark.asyncio
async def test_get_device_snapshots_basic():
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/devices")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)

@pytest.mark.asyncio
async def test_get_device_snapshots_filters():
    # assume a device exists with IP '192.168.0.1'
    device_ip = '192.168.0.1'
    min_cpu = 0
    min_errors = 0
    start_time = (datetime.utcnow() - timedelta(hours=1)).isoformat()
    end_time = datetime.utcnow().isoformat()

    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/devices", params={
            "device_ip": device_ip,
            "min_cpu": min_cpu,
            "min_errors": min_errors,
            "start_time": start_time,
            "end_time": end_time
        })
    assert resp.status_code == 200
    data = resp.json()
    for d in data:
        assert d["device_ip"] == device_ip

@pytest.mark.asyncio
async def test_devices_dashboard_basic():
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/devices/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    if data:
        device = data[0]
        assert "device_ip" in device
        assert "cpu_pct" in device
        assert "avg_cpu" in device
        assert "total_inbound" in device
        assert "top_interfaces" in device
        assert isinstance(device["top_interfaces"], list)
        assert "traffic_trend" in device
        assert isinstance(device["traffic_trend"], list)

@pytest.mark.asyncio
async def test_devices_dashboard_cache():
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # first request to generate cache
        resp1 = await ac.get("/devices/dashboard", params={"use_cache": True})
        assert resp1.status_code == 200
        data1 = resp1.json()
        # second request should hit cache
        resp2 = await ac.get("/devices/dashboard", params={"use_cache": True})
        assert resp2.status_code == 200
        data2 = resp2.json()
        # results should match
        assert data1 == data2
