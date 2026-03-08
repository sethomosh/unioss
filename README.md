# UniOSS Network Management Suite

📁 **Repository Structure**

unioss/
├── backend/
│ ├── api/ # Flask Blueprints (discovery, performance, traffic, access, SNMP)
│ ├── modules/ # Core business logic (discovery.py, performance.py, traffic.py, access_control.py)
│ ├── utils/ # DB connector, SNMP client, etc.
│ └── config/ # Logging, environment settings
├── db/
│ └── init.sql # Schema + sample data (devices, device_interfaces, performance_metrics, etc.)
├── frontend/
│ ├── src/
│ │ ├── pages/ # React pages (DiscoveryPage, DeviceDetailPage, PerformancePage, TrafficPage, AccessPage, SnmpPage, HealthPage)
│ │ ├── utils/ # API wrappers (api.ts)
│ │ └── App.tsx / index.tsx # Entry point + router
│ ├── package.json
│ └── vite.config.ts # Dev server proxy settings
└── docker-compose.yml # MySQL, SNMP‐Sim, Flask backend, React frontend

## 🚀 Quick Start

1. **Clone and enter the repo**  
   ```bash
   git clone <your‐repo‐url>
   cd unioss
