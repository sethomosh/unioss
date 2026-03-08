# UNIOSS Deployment Guide

This guide covers the deployment of the UNIOSS (Universal Network Intelligence & Orchestration Support System) application to a production environment (VPS) using Docker Compose.

## Architecture
- **Frontend**: Vite + React (PWA support)
- **Backend**: Python Flask REST API
- **Poller**: Python SNMP/Discovery engine
- **Database**: MySQL 8.0
- **SNMP Simulator**: snmpsim (for testing/demo)

## Prerequisites
- A VPS with Docker and Docker Compose installed.
- Git (to clone the repository).
- Open ports: 80, 443 (for web), 5000 (for mobile backend access if not proxied).

## Deployment Steps

### 1. Clone the Repository
```bash
git clone https://github.com/your-repo/unioss.git
cd unioss
```

### 2. Configure Environment
Copy the example environment file and adjust the values.
```bash
cp .env.example .env
nano .env
```
> [!IMPORTANT]
> Ensure `MYSQL_ROOT_PASSWORD` and `MYSQL_PASSWORD` are changed to strong passwords.
> Set `VITE_API_URL` to your domain or VPS IP (e.g., `http://your-domain.com/api`).

### 3. Build and Start
```bash
docker-compose up -d --build
```

### 4. Direct Terminal Access (Optional)
To verify the database or check logs:
```bash
docker-compose logs -f backend
docker-compose exec db mysql -u unioss_user -p unioss_db
```

## Mobile App Integration
The UNIOSS mobile application connects directly to the Backend API.
1. Ensure the VPS port `5000` (or your configured backend port) is accessible through your firewall.
2. In the mobile app settings, set the API Base URL to: `http://your-vps-ip:5000/api`.

## Maintenance & Updates
To push updates from your local development machine:
1. Commit and push to your `main` branch.
2. In the VPS terminal:
```bash
git pull origin main
docker-compose up -d --build
```

## Security Recommendations
- **Reverse Proxy**: Use Nginx Proxy Manager or Traefik to handle SSL (HTTPS) and port forwarding.
- **Fail2Ban**: Install on the VPS to prevent SSH brute force.
- **UFW (Uncomplicated Firewall)**: Only open necessary ports.
  - `ufw allow 80/tcp`
  - `ufw allow 443/tcp`
  - `ufw allow 5000/tcp` (if mobile app doesn't use 443 proxy)
