# backend/modules/signals.py

from fastapi import APIRouter, HTTPException, Query, Path
from typing import List, Optional
from backend.db.signal_dao import get_latest_per_interface, get_recent_signals, get_latest_signals

router = APIRouter()
logger_name = "signals"

@router.get("/", response_model=List[dict])
def list_signals(limit: int = Query(50, ge=1, le=1000), offset: int = Query(0, ge=0), device_ip: Optional[str] = None):
    """
    returns recent signal rows. optional device_ip to filter.
    """
    try:
        rows = get_recent_signals(limit=limit, offset=offset, device_ip=device_ip)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"error fetching signal metrics: {e}")

@router.get("/latest", response_model=List[dict])
def latest_global(limit: int = Query(50, ge=1, le=1000)):
    """
    latest signal rows across all devices
    """
    try:
        return get_latest_signals(limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"error fetching latest signals: {e}")

@router.get("/{device_ip}/latest_per_interface", response_model=List[dict])
def latest_per_interface(device_ip: str = Path(..., description="device IP")):
    """
    latest per-interface signal row for a device
    """
    try:
        rows = get_latest_per_interface(device_ip)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"error fetching latest per-interface: {e}")

@router.get("/{device_ip}/history", response_model=List[dict])
def device_history(device_ip: str = Path(..., description="device IP"),
                   limit: int = Query(100, ge=1, le=5000),
                   offset: int = Query(0, ge=0)):
    """
    full recent signal history for a device (paginated)
    """
    try:
        rows = get_recent_signals(limit=limit, offset=offset, device_ip=device_ip)
        return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"error fetching device history: {e}")
