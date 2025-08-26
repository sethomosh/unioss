#!/usr/bin/env bash
BASE="http://127.0.0.1:8001"
HDR=(-H "Content-Type: application/json")

echo "Posting demo performance metrics (bulk)..."

# Bulk endpoint accepts array of metrics
curl -s -X POST "$BASE/performance/bulk" "${HDR[@]}" -d '[
  {"device_ip":"127.0.0.1","cpu_pct":23.5,"memory_pct":41.2,"uptime_seconds":7200},
  {"device_ip":"127.0.0.1","cpu_pct":35.1,"memory_pct":55.0,"uptime_seconds":10800}
]'

echo "Posting demo traffic metrics (bulk)..."

# Build traffic array with computed 'errors'
TS1="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TS2="$(date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ)"
TS3="$(date -u -d '2 minutes ago' +%Y-%m-%dT%H:%M:%SZ)"

curl -s -X POST "$BASE/traffic/bulk" "${HDR[@]}" -d "[
  {
    \"device_ip\": \"127.0.0.1\",
    \"interface_name\": \"eth0\",
    \"inbound_kbps\": 120.5,
    \"outbound_kbps\": 50.2,
    \"in_errors\": 0,
    \"out_errors\": 0,
    \"errors\": 0,
    \"timestamp\": \"$TS1\"
  },
  {
    \"device_ip\": \"127.0.0.1\",
    \"interface_name\": \"eth1\",
    \"inbound_kbps\": 300.8,
    \"outbound_kbps\": 210.4,
    \"in_errors\": 1,
    \"out_errors\": 0,
    \"errors\": 1,
    \"timestamp\": \"$TS2\"
  },
  {
    \"device_ip\": \"127.0.0.1\",
    \"interface_name\": \"eth0\",
    \"inbound_kbps\": 98.3,
    \"outbound_kbps\": 40.1,
    \"in_errors\": 0,
    \"out_errors\": 0,
    \"errors\": 0,
    \"timestamp\": \"$TS3\"
  }
]"

echo "Posting demo access sessions (if endpoint exists)..."
curl -s -X POST "$BASE/access" "${HDR[@]}" -d '{
  "user":"alice","ip":"192.168.1.10","mac":"AA:BB:CC:01:02:03",
  "login_time":"2025-08-21T08:00:00Z","authenticated_via":"snmp"
}' || true

curl -s -X POST "$BASE/access" "${HDR[@]}" -d '{
  "user":"bob","ip":"192.168.1.11","mac":"AA:BB:CC:01:02:04",
  "login_time":"2025-08-21T07:40:00Z","logout_time":"2025-08-21T08:10:00Z","duration_seconds":1800,"authenticated_via":"database"
}' || true

echo "Seeder done."
