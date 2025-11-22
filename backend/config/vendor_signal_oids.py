# backend/config/vendor_signal_oids.py
DEFAULT_OIDS = {
    # friendly_name: numeric_oid (scalar)
    "rssi_dbm": "1.3.6.1.4.1.41112.1.1.1.0",
    "snr_db": "1.3.6.1.4.1.41112.1.1.2.0",
    "link_quality_pct": "1.3.6.1.4.1.41112.1.1.3.0",
    "tx_rate_mbps": "1.3.6.1.4.1.41112.1.1.4.0",
    "rx_rate_mbps": "1.3.6.1.4.1.41112.1.1.5.0",
    "frequency_mhz": "1.3.6.1.4.1.41112.1.1.6.0",
}

VENDOR_SIGNAL_OIDS = {
    # vendor_key -> mapping. vendor_key used by poller (device.vendor or vendor_key)
    "ubiquiti": DEFAULT_OIDS,
    "ubnt": DEFAULT_OIDS,
    "miktik": DEFAULT_OIDS,
    "mikrotik": DEFAULT_OIDS,
    # add other vendors with their own OID sets if needed
}
