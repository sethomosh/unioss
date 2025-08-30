from pydantic import BaseModel, Field
from typing import List, Optional
import datetime

class Alert(BaseModel):
    id: int
    device_ip: str
    severity: str
    message: str
    timestamp: datetime.datetime


class InterfaceSnapshot(BaseModel):
    interface_name: str
    inbound_kbps: float
    outbound_kbps: float
    errors: int

class DeviceSnapshot(BaseModel):
    device_ip: str
    cpu_pct: Optional[float] = None
    memory_pct: Optional[float] = None
    uptime_seconds: Optional[int] = None
    interfaces: List[InterfaceSnapshot] = Field(default_factory=list)
    online: Optional[bool] = None

    # SNMP / discovery fields
    hostname: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    os_version: Optional[str] = None
    status: Optional[str] = None
    error: Optional[str] = None

class Session(BaseModel):
    id: int
    device_ip: str
    user: str
    start_time: datetime.datetime
    end_time: Optional[datetime.datetime] = None
    status: str