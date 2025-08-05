# backend/utils/traffic_utils.py

# max counter (32-bit)
COUNTER_MAX = 2**32

def compute_kbps_delta(new_octets: int, old_octets: int, delta_s: float, counter_max: int = COUNTER_MAX) -> float:
    """
    Compute kilobits/sec between old and new octet counters, handling wrap.
    """
    delta = new_octets - old_octets
    if delta < 0:
        delta += counter_max
    # bits → kilobits/sec
    return round((delta * 8) / (delta_s * 1000), 2)
