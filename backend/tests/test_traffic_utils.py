# backend/tests/test_traffic_utils.py

import pytest
from backend.utils.traffic_utils import compute_kbps_delta, COUNTER_MAX

@pytest.mark.parametrize("old,new,delta_s,expected", [
    # wrap case: new lower than old by wrap amount
    (COUNTER_MAX - 300, 200, 10,
     round(((200 + (COUNTER_MAX - (COUNTER_MAX - 300))) * 8) / (10 * 1000), 2)),
    # normal case
    (1_000_000, 2_000_000, 5,
     round(((2_000_000 - 1_000_000) * 8) / (5 * 1000), 2)),
])
def test_compute_kbps_delta(old, new, delta_s, expected):
    kbps = compute_kbps_delta(new, old, delta_s)
    assert kbps == pytest.approx(expected)
