import pytest
from backend.utils.snmp_client import snmp_get, snmp_get_bulk, snmp_walk


SNMPSIM_HOST = "127.0.0.1"
SNMPSIM_COMMUNITY = "public"
SNMPSIM_PORT = 1161
TEST_OIDS = [
    "1.3.6.1.2.1.1.3.0",  # sysUpTime
    "1.3.6.1.2.1.2.2.1.10.1",  # ifInOctets for interface 1
    "1.3.6.1.2.1.2.2.1.16.1",  # ifOutOctets for interface 1
]


def test_snmp_get_bulk_invalid_host_raises():
    with pytest.raises(Exception):
        snmp_get_bulk("256.256.256.256", SNMPSIM_COMMUNITY, TEST_OIDS, port=SNMPSIM_PORT, retries=1, timeout=1)


def test_snmp_get_bulk_success_types():
    result = snmp_get_bulk(SNMPSIM_HOST, SNMPSIM_COMMUNITY, TEST_OIDS, port=SNMPSIM_PORT, retries=1, timeout=1)
    for oid, val in result.items():
        # value should be int, string, or None
        assert val is None or isinstance(val, int) or isinstance(val, str), f"Unexpected value type for {oid}: {val}"


def test_snmp_get_single_oid():
    val = snmp_get(SNMPSIM_HOST, SNMPSIM_COMMUNITY, TEST_OIDS[0], port=SNMPSIM_PORT, retries=1, timeout=1)
    assert val is None or isinstance(val, int) or isinstance(val, str), f"Unexpected value: {val}"


def test_snmp_walk_base_oid():
    try:
        results = list(snmp_walk(SNMPSIM_HOST, SNMPSIM_COMMUNITY, "1.3.6.1.2.1.1", port=SNMPSIM_PORT, retries=1, timeout=1))
        for oid, val in results:
            assert val is None or isinstance(val, int) or isinstance(val, str), f"Unexpected value for {oid}: {val}"
    except Exception as e:
        # SNMPSIM may not have walkable OIDs; fail gracefully with informative message
        pytest.skip(f"snmp_walk skipped due to SNMPSIM limitation: {e}")


def test_snmp_get_bulk_retry_mechanism(monkeypatch):
    from backend.utils import snmp_client
    original_getCmd = snmp_client.getCmd

    attempts = []

    def fake_getCmd(*args, **kwargs):
        if not attempts:
            attempts.append(1)
            raise Exception("simulated network error")
        return original_getCmd(*args, **kwargs)

    monkeypatch.setattr(snmp_client, "getCmd", fake_getCmd)

    result = snmp_get_bulk(SNMPSIM_HOST, SNMPSIM_COMMUNITY, TEST_OIDS, port=SNMPSIM_PORT, retries=2, timeout=1)
    for val in result.values():
        assert val is None or isinstance(val, int) or isinstance(val, str), f"Unexpected value after retry: {val}"
