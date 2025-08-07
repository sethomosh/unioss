import pytest
from backend.utils.snmp_client import snmp_get_bulk

def test_bulk_get_invalid_host_raises():
    with pytest.raises(Exception) as exc:
        snmp_get_bulk("invalid-host", "public", ["1.3.6.1.2.1.1.1.0"], retries=2, timeout=1)
    assert "failed after" in str(exc.value)
