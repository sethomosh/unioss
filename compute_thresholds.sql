WITH ordered AS (
  SELECT
    device_ip,
    interface_index,
    rssi_dbm,
    ROW_NUMBER() OVER (
        PARTITION BY device_ip, interface_index 
        ORDER BY rssi_dbm
    ) AS rn,
    COUNT(*) OVER (
        PARTITION BY device_ip, interface_index
    ) AS cnt
  FROM signal_metrics
  WHERE rssi_dbm IS NOT NULL
),
quant AS (
  SELECT
    device_ip,
    interface_index,
    rssi_dbm,
    rn,
    cnt,
    (rn - 1) / (cnt - 1) AS frac
  FROM ordered
),
stats AS (
  SELECT
    device_ip,
    interface_index,
    MIN(CASE WHEN frac >= 0.50 THEN rssi_dbm END) AS warn_dbm,
    MIN(CASE WHEN frac >= 0.25 THEN rssi_dbm END) AS high_dbm,
    MIN(CASE WHEN frac >= 0.10 THEN rssi_dbm END) AS critical_dbm
  FROM quant
  GROUP BY device_ip, interface_index
)
SELECT * FROM stats;
