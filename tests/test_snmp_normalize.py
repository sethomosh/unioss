# tests/test_snmp_normalize.py
from backend.utils.snmp_client import _normalize_value

def test_normalize_counter32():
    assert _normalize_value("Counter32: 100000") == "100000"

def test_normalize_timeticks():
    assert _normalize_value("Timeticks: (12345678) 1 day") == "12345678"

def test_normalize_numeric():
    assert _normalize_value("200") == "200"
