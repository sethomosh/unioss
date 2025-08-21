# tests/test_traffic_wrap.py
from backend.utils.traffic_utils import compute_kbps_delta

def test_wrap_32bit():
    # prev near max 32-bit, new small -> wrapped
    prev = (2**32) - 50
    new = 100
    delta = compute_kbps_delta(new, prev, 10, counter_max=2**32)
    assert delta >= 0

def test_no_wrap():
    prev = 1000
    new = 1500
    delta = compute_kbps_delta(new, prev, 10, counter_max=2**32)
    assert round(delta,2) == round(((new - prev) * 8) / (10 * 1000),2)
