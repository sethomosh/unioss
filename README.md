# UNIOSS: Universal Network Intelligence & Orchestration Support System

![UNIOSS Logo](https://img.shields.io/badge/UNIOSS-Network_Intelligence-primary?style=for-the-badge)
![Status](https://img.shields.io/badge/Status-Production_Ready-emerald?style=for-the-badge)
![UI](https://img.shields.io/badge/UI-Premium_Dark-blueviolet?style=for-the-badge)

UNIOSS is a mission-critical network monitoring and management suite designed for high-density hardware ecosystems. It provides real-time telemetry, deep device interrogation via SNMP, and intelligent alerting through a premium, glassmorphic interface.

---

## 💎 Visual Experience

The UNIOSS interface is engineered for clarity and professional oversight, featuring a sophisticated dark mode with glassmorphism effects.

````carousel
![Premium Dashboard](file:///C:/Users/zeph/.gemini/antigravity/brain/6bf7edd2-39cc-4f09-8433-df05b105c6ab/dashboard_dark_mode_1772968597624.png)
<!-- slide -->
![Network Inventory](file:///C:/Users/zeph/.gemini/antigravity/brain/6bf7edd2-39cc-4f09-8433-df05b105c6ab/devices_page_dark_mode_1772968572157.png)
````

---

## 🚀 Key Modules

### 📊 Tactical Dashboard
Real-time orchestration of network health. Track Online/Offline device ratios, CPU/Memory distribution, and live traffic flows at a glance.

### 🛡️ Intelligent Alerts (AlertIQ)
Advanced anomaly detection including:
- **RSSI Degradation**: Real-time signal strength monitoring.
- **Resource Exhaustion**: Instant alerts for high CPU/Memory usage.
- **Unauthorized Access**: Cross-referencing active sessions with the Network ACL.
- **Offline Diagnostics**: Automatic detection of offline reasons (e.g., SNMP timeout, bad signal).

### 🔍 Device Intel & SNMP Suite
Deep-dive into individual hardware nodes:
- **Tactical Console**: Execute SNMP GET and WALK operations directly from the browser.
- **Interface Analytics**: View granular traffic and performance metrics per device.
- **Logical Naming**: Devices are identified by human-readable hostnames and logical tower groupings.

### 🔒 Access Control (ACL)
Manage network boundaries with a built-in Access Control List.
- **Session Scrutiny**: Monitor authenticated users and their connection methods.
- **Tactical Kickout**: Simulate or trigger session terminations with documented reason codes.

---

## 🏗️ Architecture & Tech Stack

UNIOSS is built on a robust, scalable architecture:

- **Frontend**: **Vite + React** with Tailwind CSS. Optimized for 60FPS animations and PWA support.
- **Backend**: **Python Flask** REST API. Organized into clean Blueprints for modularity.
- **Engine**: **Async SNMP/Discovery Poller**. Efficiently interrogates the hardware layer.
- **Data**: **MySQL 8.0**. Handles time-series metrics and relational device mapping.
- **Mobile Access**: The backend is ready to pipe data to the UNIOSS Mobile application.

---

## 🛠️ Installation & Setup

### Development Mode (Local)

1. **Prerequisites**: Python 3.10+, Node.js 18+, MySQL 8.0.
2. **Environment**:
   ```bash
   cp .env.example .env
   # Update .env with your local DB credentials
   ```
3. **Backend Setup**:
   ```bash
   cd backend
   pip install -r requirements.txt
   python app_flask.py
   ```
4. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

### Production Mode (Docker)

The fastest way to deploy UNIOSS is via Docker Compose:
```bash
docker-compose up -d --build
```
This starts the Web UI (3000), API (5000), MySQL (3306), and the SNMP Simulator (1611).

---

## 🚢 Deployment

For professional deployment on a VPS (DigitalOcean, Hetzner, etc.), please refer to the [**DEPLOYMENT.md**](./DEPLOYMENT.md) guide. It includes:
- Security hardening recommendations.
- Reverse proxy (Nginx) configuration.
- SSL setup for secure mobile connectivity.

---

## 📱 Mobile Integration

UNIOSS is designed to be the single source of truth for your network. The backend exposes a comprehensive API that drives the UNIOSS Mobile app. Ensure your port `5000` is securely exposed to allow mobile telemetry synchronization.

---
*Created by the UNIOSS Engineering Team*
