<!--
 * @Author: HadesZ
 * @Date: 2025-11-03 12:18:51
 * @LastEditors: HadesZ
 * @LastEditTime: 2025-11-03 16:27:16
 * @Description: 
-->
# Server Monitor System

A complete server monitoring system with agents, monitoring server, and dashboard.

## Installation

### Global Installation (Recommended)
```bash
npm install -g @hadesz/monitor

```

## Usage
```bash
# Server Side
monitor-server

# Agent Side
monitor-agent -i my-server-name --host monitor.example.com --interval 5000
```

### Options

#### Agent Options
- `--id <id>`: Agent ID (default: hostname)
- `--host <host>`: Monitor server host (required)
- `--http-port <port>`: Monitor server HTTP port (default: 3100)
- `--udp-port <port>`: Monitor server UDP port (default: 41234)
- `--interval <ms>`: Collection interval in milliseconds (default: 10000)
- `--verbose`: Enable verbose logging

#### Server Options
- `--mongo-uri <uri>`: MongoDB connection URI (default: mongodb://localhost:27017/monitoring)
- `--http-port <port>`: HTTP receiver port (default: 3100)
- `--udp-port <port>`: UDP receiver port (default: 41234)
- `--dashboard-port <port>`: Dashboard port (default: 4000)
- `--no-dashboard`: Disable dashboard
- `--verbose`: Enable verbose logging