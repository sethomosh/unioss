# UNIOSS Frontend Application

UNIOSS (Unified Network Intelligence & Optimization System) is a comprehensive network monitoring and management application built with React, TypeScript, and modern web technologies.

## Features

### Pages
- **Dashboard**: Aggregated system overview with quick stats, health pills, top alarms, aggregated charts and KPI cards
- **Device Discovery**: Inventory table with filtering, search, quick actions (SNMP, open device page)
- **Device Detail**: Per-device dashboard showing current performance, traffic per-interface, last seen, sysdescr and SNMP quick-get
- **Performance Charts**: Interactive time-series charts (CPU, memory, uptime) with device selector and zoom/pan
- **Performance History**: Normalized historical table + small sparklines and export
- **Traffic Monitoring**: Per-interface traffic charts and historical table
- **Analytics Calendar**: Calendar/timeline view for events, alerts, maintenance windows and sortable by device / severity
- **Access Sessions**: Active/previous sessions table, login/logout details and session drilldowns
- **Alerts & Notifications**: List of active and historical alerts, acknowledge, filters by severity
- **SNMP Tools**: Ad-hoc SNMP GET/Walk UI and bulk SNMP actions
- **Settings**: Theme, API base, mock toggle, user management (basic)

### User Roles and Permissions
- **Administrator**: Full access to all pages, can acknowledge/remove alerts, manage users, change system settings, and trigger remediation actions
- **Operator**: View and interact with dashboards, acknowledge alerts, view device details, run SNMP tools, but cannot change user accounts or system-level settings
- **Viewer / Readonly**: Can view dashboards, device lists, and reports but cannot acknowledge alerts, run SNMP actions, or change settings
- **Auditor (optional)**: Read-only with export/report access and audit logs visibility

## Technical Stack

- **Framework**: React 18 with TypeScript
- **Routing**: React Router v6
- **Styling**: Tailwind CSS with custom design tokens
- **UI Components**: shadcn/ui primitives
- **Animations**: Framer Motion
- **Data Visualization**: Chart.js (react-chartjs-2) and Recharts
- **State Management**: React Context API and custom hooks
- **Data Fetching**: TanStack Query (React Query)
- **Build Tool**: Vite

## Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd frontend
```

2. Install dependencies:
```bash
npm install
```

### Environment Variables

Create a `.env` file in the frontend root directory:

```env
# API Configuration
VITE_API_BASE=/api
VITE_MOCK=false

# For mock data (development)
# VITE_API_BASE=/api
# VITE_MOCK=true
```

### Development

Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`.

### Building for Production

Build the application:
```bash
npm run build
```

Preview the production build:
```bash
npm run preview
```

## Project Structure

```
frontend/
├── public/                 # Static assets
├── src/
│   ├── components/         # Reusable UI components
│   ├── contexts/           # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── mocks/              # Mock data for development
│   ├── pages/              # Page components
│   ├── services/           # API service layer
│   ├── styles/             # Global styles and theme files
│   ├── types/              # TypeScript type definitions
│   ├── utils/              # Utility functions
│   ├── App.tsx             # Main application component
│   └── main.tsx            # Entry point
├── .env                    # Environment variables
├── .env.example            # Example environment variables
├── index.html              # HTML template
├── package.json            # Project dependencies and scripts
├── tsconfig.json           # TypeScript configuration
├── vite.config.ts          # Vite configuration
└── README.md               # This file
```

## API Integration

The application supports both real API integration and mock data for development.

### Real API Mode
Set `VITE_MOCK=false` in your `.env` file and configure `VITE_API_BASE` to point to your API server.

### Mock Data Mode
Set `VITE_MOCK=true` in your `.env` file to use mock data. This is useful for development and testing.

### API Endpoints

The application expects the following API endpoints:

- **GET** `/api/discovery/devices` - List all devices
- **GET** `/api/discovery/devices/:ip` - Get device details by IP
- **GET** `/api/performance` - Get current performance metrics for all devices
- **GET** `/api/performance/history?device_ip=:ip&hours=:hours` - Get performance history for a device
- **GET** `/api/traffic` - Get current traffic data for all devices
- **GET** `/api/traffic/history?device_ip=:ip&interface_name=:name&hours=:hours` - Get traffic history for a device interface
- **GET** `/api/access/sessions` - Get access sessions
- **GET** `/api/alerts` - Get alerts
- **POST** `/api/alerts/:id/acknowledge` - Acknowledge an alert
- **GET** `/api/health` - Get system health status
- **GET** `/api/snmp/get?device_ip=:ip&oid=:oid` - Get SNMP data for a device
- **GET** `/api/snmp/walk?device_ip=:ip&oid=:oid` - Walk SNMP tree for a device
- **GET** `/api/dashboard/metrics` - Get dashboard metrics

### Data Structures

#### Device
```typescript
interface Device {
  device_ip: string;
  hostname: string;
  vendor: string;
  os: string;
  status: 'up' | 'down' | 'unknown';
  last_seen: string; // ISO8601 timestamp
  interfaces?: Interface[];
}
```

#### Interface
```typescript
interface Interface {
  interface_name: string;
  description: string;
  status: 'up' | 'down' | 'admin-down';
  speed?: number;
  duplex?: string;
}
```

#### Performance Metrics
```typescript
interface PerformanceMetrics {
  device_ip: string;
  cpu_pct: number;
  memory_pct: number;
  timestamp: string; // ISO8601 timestamp
}
```

#### Traffic Data
```typescript
interface TrafficData {
  device_ip: string;
  interface_name: string;
  in_octets: number;
  out_octets: number;
  in_packets: number;
  out_packets: number;
  timestamp: string; // ISO8601 timestamp
}
```

#### Session
```typescript
interface Session {
  session_id: string;
  device_ip: string;
  username: string;
  start_time: string; // ISO8601 timestamp
  last_activity: string; // ISO8601 timestamp
  protocol: string;
  status: 'active' | 'idle' | 'disconnected';
}
```

#### Alert
```typescript
interface Alert {
  id: string;
  device_ip: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string; // ISO8601 timestamp
  acknowledged: boolean;
  category: string;
}
```

#### Health Status
```typescript
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string; // ISO8601 timestamp
  services: {
    [service: string]: 'up' | 'down';
  };
}
```

#### Dashboard Metrics
```typescript
interface DashboardMetrics {
  total_devices: number;
  devices_up: number;
  devices_down: number;
  active_alerts: number;
  avg_cpu: number;
  total_throughput: number;
}
```

## Authentication

The application includes a role-based authentication system with four user roles:
- Administrator
- Operator
- Viewer
- Auditor

Demo credentials:
- admin/password (Administrator)
- operator/password (Operator)
- viewer/password (Viewer)
- auditor/password (Auditor)

## Theming

The application supports light and dark themes with automatic system preference detection. Users can toggle between themes using the theme switcher in the top bar.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue on the GitHub repository.
