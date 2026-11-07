# 🎓 Result Flow — Result Portal with Auto-Scaling and Load Balancing

> A cloud-based system that keeps a college result website running smoothly when thousands of students open it at the same time.

**Author:** Anushka Yadav  
**Subject:** Cloud Computing  
**Project Type:** B.Tech CSE — Academic Project  
**Repository:** [github.com/anushkayadav0901/ResultFlow](https://github.com/anushkayadav0901/ResultFlow)

---

## 📋 Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Technologies Used](#technologies-used)
- [Setup and Installation](#setup-and-installation)
- [How to Run](#how-to-run)
- [Load Balancing Algorithms](#load-balancing-algorithms)
- [Auto-Scaling](#auto-scaling)
- [Health Monitoring](#health-monitoring)
- [API Reference](#api-reference)
- [Demo Students](#demo-students)
- [Configuration](#configuration)
- [Presentation](#presentation)

---

## 📌 About the Project

**Result Flow** is a cloud-based result portal that demonstrates how a college result website can remain fast and available even when thousands of students open it at the same time — for example, on result declaration day.

A **load balancer** sits in front of multiple backend servers and routes each student's result request using one of four algorithms. An **auto-scaling engine** monitors CPU usage and automatically adds standby servers when traffic is high, then removes them when traffic drops, saving compute cost. If any server crashes, the system detects it and stops routing traffic to it. A **live dashboard** shows all of this happening in real time.

This project demonstrates three key cloud computing concepts:

| Concept | How it is shown |
|---------|----------------|
| **Elasticity** | Auto-scaler adds/removes servers based on CPU load |
| **Scalability** | Multiple backend servers handle concurrent student requests |
| **High Availability** | Health checks reroute traffic away from failed servers |

---

## ✨ Features

- 🔍 **Student Result Portal** — Enter a roll number, choose an algorithm, and see the result instantly
- ⚖️ **4 Load Balancing Algorithms** — Round Robin, Weighted Round Robin, Least Connections, Least Response Time, Dynamic
- 📈 **Auto-Scaling Engine** — Scales up when CPU > 75%, scales down when CPU < 25%
- 🏥 **Health Checks** — Unhealthy servers are automatically removed from the routing pool
- 📊 **Live Dashboard** — Real-time CPU usage chart, active connections chart, server pool status, algorithm switcher
- 🔁 **Dual Load Balancers** — LB-1 (port 4001) and LB-2 (port 4002) run in active-active mode for redundancy
- 🧾 **Consistent Results** — Every server returns the same result for the same roll number (shared static data)
- 🏷️ **Request Tracing** — Every result response shows which server handled it, which algorithm was used, and response time

---

## 🏗️ Architecture

```
                        Student Browser
                              │
                 Checks both LBs, picks healthy one
                              │
              ┌───────────────┴───────────────┐
              │                               │
    ┌─────────▼──────────┐       ┌────────────▼────────────┐
    │  Load Balancer 1   │       │   Load Balancer 2        │
    │  localhost:4001    │       │   localhost:4002          │
    │                    │       │                           │
    │  Algorithms:       │       │  (Active-Active Pair)     │
    │  • Round Robin     │       │  Shares same server pool  │
    │  • Weighted RR     │       │                           │
    │  • Least Conn.     │       │  /getResult               │
    │  • Least RT        │       │  /metrics                 │
    │  • Dynamic         │       │  /status                  │
    │                    │       │  /changeAlgorithm         │
    │  Auto-scaler       │       │                           │
    │  Health Checker    │       │                           │
    └────────┬───────────┘       └───────────────────────────┘
             │
   Selects healthy server based on algorithm
             │
   ┌─────────┴──────────────────────────────────┐
   │              Primary Server Pool            │
   │   Server-8001  Server-8002  Server-8003    │
   │   Server-8004  Server-8005                  │
   └─────────────────────────────────────────────┘
   ┌─────────────────────────────────────────────┐
   │              Standby (Scaling) Pool         │
   │   Server-8006  Server-8007                  │
   │   (Moved to Primary when CPU is high)       │
   └─────────────────────────────────────────────┘
```

**How autoscaling works (pool-level):**  
The auto-scaler does **not** create new OS processes or VMs. It monitors CPU usage on each primary server every 500ms. If any server's CPU exceeds 75%, a standby server is promoted to the primary pool. If CPU drops below 25%, an excess server is moved back to standby. All 7 servers (8001–8007) run as Node.js processes throughout — only their routing membership changes.

---

## 📁 Project Structure

```
ResultFlow/
│
├── application-servers/
│   ├── data/
│   │   └── students.json          ← 15 fictional student records
│   ├── server/
│   │   └── server.js              ← Express app server (runs on ports 8001–8008)
│   └── package.json
│
├── load-balancers/
│   ├── config.json                ← Algorithm, thresholds, WRR weights
│   ├── load-balancer-1/
│   │   └── load-balancer.js       ← LB on port 4001
│   ├── load-balancer-2/
│   │   └── load-balancer.js       ← LB on port 4002
│   └── package.json
│
├── frontend/
│   ├── index.html                 ← Student Result Portal
│   ├── script.js                  ← Portal JavaScript
│   ├── cpuUsage.html              ← Live Dashboard (CPU chart + server status)
│   └── requestCount.html          ← Active Connections chart
│
├── architecture.png               ← Architecture diagram
├── Cloud Computing.pdf            ← Project presentation (PDF)
├── Cloud Computing.pptx           ← Project presentation (PPTX)
└── Readme.md                      ← This file
```

---

## 🛠️ Technologies Used

| Technology | Purpose |
|-----------|---------|
| **Node.js v22** | Server runtime for both LBs and app servers |
| **Express.js** | HTTP framework for all API endpoints |
| **Axios** | LB uses this to forward requests to app servers |
| **Chart.js** | Real-time bar and line charts on the dashboard |
| **Concurrently** | Launches all 7+ servers in one terminal command |
| **Nodemon** | Auto-restarts servers on file change during dev |
| **JSON** | Student data (`students.json`) and config (`config.json`) |

---

## ⚙️ Setup and Installation

### Prerequisites

- **Node.js** v14 or higher (project tested on v22.12.0)
- **npm** (comes with Node.js)

### Step 1 — Clone the repository

```bash
git clone https://github.com/anushkayadav0901/ResultFlow.git
cd ResultFlow
```

### Step 2 — Install dependencies

```bash
# Install for application servers
cd application-servers
npm install

# Install for load balancers
cd ../load-balancers
npm install
```

---

## ▶️ How to Run

You need **two separate terminal windows** open at the same time.

### Terminal 1 — Start Application Servers (ports 8001–8008)

```bash
cd application-servers
npm start
```

You should see:
```
[Result Flow] Application Server-8001 listening at http://localhost:8001
[Result Flow] Application Server-8002 listening at http://localhost:8002
...up to 8008
```

### Terminal 2 — Start Load Balancers (ports 4001 & 4002)

```bash
cd load-balancers
npm start
```

You should see:
```
[Result Flow] Load Balancer-1 listening at http://localhost:4001
[Result Flow] Load Balancer-2 listening at http://localhost:4002
Using load balancing algorithm: Round Robin
```

### Open in Browser

| URL | What it shows |
|-----|--------------|
| `frontend/index.html` | Student Result Portal — enter roll number here |
| `frontend/cpuUsage.html` | Live Dashboard — CPU usage, server pool, algorithm switcher |
| `frontend/requestCount.html` | Active Connections per server |

> Open `index.html` directly in your browser as a file (no extra server needed).

---

## ⚖️ Load Balancing Algorithms

### 1. Round Robin
Requests are distributed **sequentially** across all healthy servers.  
Server-8001 → Server-8002 → Server-8003 → ... → Server-8001 → ...

### 2. Weighted Round Robin ⭐ *(added in this project)*
Servers are assigned weights. Higher-weight servers receive proportionally more requests.

Default weights (from `config.json`):
```
Server-8001: weight 3  →  gets 3× more requests than Server-8005
Server-8002: weight 3
Server-8003: weight 2
Server-8004: weight 2
Server-8005: weight 1
```
Useful when some servers have more CPU/RAM than others.

### 3. Least Connections
Routes each request to the server with the **fewest active connections** at that moment.  
Best for requests that take varying amounts of time to complete.

### 4. Least Response Time
Routes to the server that responded **fastest** in the most recent request.  
Keeps tracking response times and always prefers the quickest server.

### 5. Dynamic
Combines all three metrics into a single score:

```
score = (CPU usage / 100) + (active connections / 10) + (response time ms / 1000)
```

The server with the **lowest score** is selected. Adapts in real time to actual server load.

---

## 📈 Auto-Scaling

The auto-scaler runs inside each load balancer and checks CPU every **500ms**.

| Condition | Action |
|-----------|--------|
| Any primary server CPU > 75% | Move one standby server → primary pool |
| Any primary server CPU < 25% | Move one primary server → standby pool (if above minimum) |
| Primary pool at minimum (4 servers) | No scale-down happens |

**Important note for viva:** This is *pool-level* auto-scaling — all 7 Node.js processes run from startup. The auto-scaler controls which servers actively receive traffic, not which processes are running. This demonstrates the concept of horizontal scaling and elasticity without needing containers or VMs.

---

## 🏥 Health Monitoring

Each load balancer polls all servers' `/health` endpoint every **30 seconds**.

- Healthy servers → included in routing pool
- Unhealthy servers → excluded until they recover
- Every `/getResult` request also does a live health check before selecting a server

```json
GET /health
→ { "status": "Healthy", "server": "Server-8001" }
```

---

## 📡 API Reference

### Load Balancer Endpoints (port 4001 or 4002)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | LB health check |
| `GET` | `/status` | Current algorithm, primary/standby server lists |
| `GET` | `/metrics` | CPU usage and connection counts for all servers |
| `POST` | `/getResult` | Fetch student result (routes to backend via algorithm) |
| `POST` | `/sendRequest` | Generic request routing (original functionality) |
| `POST` | `/changeAlgorithm` | Switch algorithm at runtime |

#### `/getResult` — Request & Response

**Request:**
```json
POST http://localhost:4001/getResult
{
  "rollNumber": "RF2101001"
}
```

**Response:**
```json
{
  "rollNumber": "RF2101001",
  "name": "Aarav Sharma",
  "course": "B.Tech - Computer Science & Engineering",
  "semester": 4,
  "subjects": [
    { "name": "Mathematics IV",   "maxMarks": 100, "marksObtained": 78 },
    { "name": "Operating Systems","maxMarks": 100, "marksObtained": 82 },
    ...
  ],
  "total": 414,
  "maxTotal": 500,
  "percentage": "82.80",
  "status": "Pass",
  "servedBy": "Server-8003",
  "timestamp": "2026-11-07T10:45:12.000Z",
  "loadBalancer": "LB-4001",
  "algorithm": "Round Robin",
  "lbResponseTimeMs": 312
}
```

#### `/changeAlgorithm` — Switch Algorithm

```json
POST http://localhost:4001/changeAlgorithm
{
  "algorithm": "Weighted Round Robin"
}
```

Valid values: `"Round Robin"` | `"Weighted Round Robin"` | `"Least Connections"` | `"Least Response Time"` | `"Dynamic"`

---

### Application Server Endpoints (ports 8001–8008)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health status |
| `GET` | `/cpuUsage` | Current CPU usage (%) |
| `GET` | `/activeConnections` | Number of active connections |
| `POST` | `/result` | Fetch student result by roll number |
| `POST` | `/processRequest` | Generic request handler (original) |

---

## 🎓 Demo Students

The system includes **15 fictional student records** in `application-servers/data/students.json`.

| Roll Number | Name | Semester | Percentage | Status |
|-------------|------|----------|------------|--------|
| RF2101001 | Aarav Sharma | 4 | 82.80% | ✅ Pass |
| RF2101002 | Priya Verma | 4 | 68.80% | ✅ Pass |
| RF2101003 | Rohit Kumar | 4 | 50.00% | ✅ Pass |
| RF2101004 | Sneha Patel | 4 | 92.40% | ✅ Pass |
| RF2101005 | Arjun Nair | 4 | 50.00% | ❌ **Fail** (Maths IV < 40) |
| RF2101006 | Kavya Singh | 4 | 72.00% | ✅ Pass |
| RF2101007 | Rahul Gupta | 4 | 52.00% | ✅ Pass |
| RF2101008 | Ananya Joshi | 4 | 89.20% | ✅ Pass |
| RF2101009 | Vikram Reddy | 4 | 41.80% | ❌ **Fail** (OS < 40) |
| RF2101010 | Pooja Mehta | 4 | 80.20% | ✅ Pass |
| RF2101011 | Nikhil Tiwari | 3 | 70.00% | ✅ Pass |
| RF2101012 | Divya Rao | 3 | 87.40% | ✅ Pass |
| RF2101013 | Siddharth Jain | 3 | 44.60% | ❌ **Fail** (Discrete Maths < 40) |
| RF2101014 | Meera Nambiar | 3 | 58.80% | ✅ Pass |
| RF2101015 | Tushar Bhatt | 4 | 65.60% | ✅ Pass |

> All student data is **fictional** and created for demonstration purposes only.

---

## 🔧 Configuration

Edit `load-balancers/config.json` to change behaviour without touching code:

```json
{
  "algorithm": "Round Robin",
  "weights": {
    "http://localhost:8001": 3,
    "http://localhost:8002": 3,
    "http://localhost:8003": 2,
    "http://localhost:8004": 2,
    "http://localhost:8005": 1
  },
  "highUsageThreshold": 75,
  "lowUsageThreshold": 25,
  "minPrimaryServers": 4,
  "autoscaling": true
}
```

| Option | Description |
|--------|-------------|
| `algorithm` | Default algorithm on startup |
| `weights` | Per-server weights for Weighted Round Robin |
| `highUsageThreshold` | CPU % above which a standby server is added |
| `lowUsageThreshold` | CPU % below which a server is moved to standby |
| `minPrimaryServers` | Never scale below this many primary servers |
| `autoscaling` | Enable/disable autoscaling (`true`/`false`) |

---

## 📑 Presentation

The project presentation is included in this repository:

- 📥 [Cloud Computing.pptx](<Cloud Computing.pptx>) — PowerPoint slides
- 📥 [Cloud Computing.pdf](<Cloud Computing.pdf>) — PDF version

---

## 👩‍💻 Author

**Anushka Yadav**  
B.Tech — Computer Science & Engineering  
Cloud Computing Subject Project  
GitHub: [@anushkayadav0901](https://github.com/anushkayadav0901)

---

*Result Flow — demonstrating elasticity, scalability, and high availability in cloud computing.*
