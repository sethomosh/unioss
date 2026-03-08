import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.modules.discovery import get_device_inventory

def verify():
    inv = get_device_inventory()
    print(f"Total devices in inventory: {len(inv)}")
    
    towers = {}
    for d in inv:
        t_name = d.get('tower_name') or 'Unknown'
        towers.setdefault(t_name, []).append(d)
        
    for t_name in sorted(towers.keys()):
        devices = towers[t_name]
        up = len([d for d in devices if d['status'] == 'up'])
        down = len([d for d in devices if d['status'] == 'down'])
        print(f"{t_name}: {up} UP, {down} DOWN")

if __name__ == "__main__":
    verify()
