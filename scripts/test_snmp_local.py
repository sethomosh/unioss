# scripts/test_snmp_local.py
from backend.utils.snmp_client import snmp_get, snmp_walk, snmp_get_bulk
import pprint

host = "127.0.0.1"
port = 1161
community = "public"

print("sysUpTime:", snmp_get(host, community, "1.3.6.1.2.1.1.3.0", port=port))
print("rssi_dbm:", snmp_get(host, community, "1.3.6.1.4.1.41112.1.1.1.0", port=port))
print("ifDescrs:")
pprint.pprint(dict(snmp_walk(host, community, "1.3.6.1.2.1.2.2.1.2", port=port)))
print("sample in/out octets (first few):")
pprint.pprint({k:v for k,v in dict(snmp_walk(host, community, "1.3.6.1.2.1.2.2.1.10", port=port)).items()[:6]})
