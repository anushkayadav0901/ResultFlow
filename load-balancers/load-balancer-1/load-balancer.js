/**
 * Result Flow — Load Balancer 1 (Port 4001)
 * Author: Anushka Yadav
 * Cloud Computing Project — B.Tech CSE
 *
 * Algorithms: Round Robin, Weighted Round Robin, Least Connections,
 *             Least Response Time, Dynamic
 * Features:   Auto-scaling, Health Checks, Events Log, /getResult portal route
 */

const express = require('express');
const cors = require('cors');
const { get, post } = require('axios');
const { readFileSync } = require('fs');

const app = express();
const LB_PORT = 4001;
app.use(cors());
app.use(express.json());

// ── Load config ──────────────────────────────────────────────────────────────
let algorithm = 'Round Robin';
let serverWeights = {};
let highUsageThreshold, lowUsageThreshold, minPrimaryServers;

try {
  const config = JSON.parse(readFileSync('./config.json', 'utf8'));
  algorithm          = config.algorithm          || algorithm;
  highUsageThreshold = config.highUsageThreshold;
  lowUsageThreshold  = config.lowUsageThreshold;
  minPrimaryServers  = config.minPrimaryServers;
  serverWeights      = config.weights || {};
  console.log(`[LB-${LB_PORT}] Algorithm: ${algorithm}`);
} catch (err) {
  console.error(`[LB-${LB_PORT}] Config error:`, err.message);
}

const HIGH_USAGE_THRESHOLD = highUsageThreshold || 75;
const LOW_USAGE_THRESHOLD  = lowUsageThreshold  || 25;
const MIN_PRIMARY_SERVERS  = minPrimaryServers  || 4;

// ── Event log ─────────────────────────────────────────────────────────────────
const eventLog = [];
const MAX_EVENTS = 100;

function logEvent(type, message) {
  eventLog.unshift({ type, message, timestamp: new Date().toISOString() });
  if (eventLog.length > MAX_EVENTS) eventLog.pop();
  console.log(`[LB-${LB_PORT}] [${type}] ${message}`);
}

// ── Server pools ──────────────────────────────────────────────────────────────
let primaryServers = [
  'http://localhost:8001',
  'http://localhost:8002',
  'http://localhost:8003',
  'http://localhost:8004',
  'http://localhost:8005',
];

let scalingServers = [
  'http://localhost:8006',
  'http://localhost:8007',
];

const connectionsCount  = {};
const responseTime      = {};
const serverHealthState = {};   // tracks last known health (true/false) for change detection
let   roundRobinIndex   = 0;
let   totalRequestsHandled = 0;

// ── Health check helper ───────────────────────────────────────────────────────
const checkServerHealth = async () => {
  const all = [...primaryServers, ...scalingServers];
  const checks = all.map(async (server) => {
    try {
      const r = await get(`${server}/health`, { timeout: 2000 });
      return { url: server, healthy: r.data.status === 'Healthy' };
    } catch {
      return { url: server, healthy: false };
    }
  });
  const results = await Promise.allSettled(checks);
  const healthData = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { url: '', healthy: false }
  );

  // Detect state changes and emit events
  healthData.forEach(({ url, healthy }) => {
    if (!url) return;
    const prev = serverHealthState[url];
    if (prev === true  && !healthy) logEvent('SERVER_DOWN', `${url} went DOWN — traffic rerouted`);
    if (prev === false &&  healthy) logEvent('SERVER_UP',   `${url} is back ONLINE`);
    serverHealthState[url] = healthy;
  });

  return healthData;
};

// ── Server selection (all algorithms) ────────────────────────────────────────
const selectServer = async (servers) => {
  switch (algorithm) {

    case 'Round Robin': {
      const s = servers[roundRobinIndex % servers.length];
      roundRobinIndex++;
      return s;
    }

    case 'Weighted Round Robin': {
      // Each server appears (weight) times in the virtual rotation list
      const weightedList = [];
      servers.forEach((s) => {
        const w = serverWeights[s] || 1;
        for (let i = 0; i < w; i++) weightedList.push(s);
      });
      const s = weightedList[roundRobinIndex % weightedList.length];
      roundRobinIndex++;
      return s;
    }

    case 'Least Connections':
      return servers.reduce((best, curr) => {
        connectionsCount[best] = connectionsCount[best] || 0;
        connectionsCount[curr] = connectionsCount[curr] || 0;
        return connectionsCount[curr] < connectionsCount[best] ? curr : best;
      });

    case 'Least Response Time':
      return servers.reduce((best, curr) => {
        responseTime[best] = responseTime[best] || 0;
        responseTime[curr] = responseTime[curr] || 0;
        return responseTime[curr] < responseTime[best] ? curr : best;
      });

    case 'Dynamic': {
      const scored = await Promise.all(
        servers.map(async (s) => {
          try {
            const r = await get(`${s}/cpuUsage`, { timeout: 1000 });
            const cpu  = r.data.usage || 0;
            const conn = connectionsCount[s] || 0;
            const rt   = responseTime[s]     || 0;
            return { server: s, score: cpu / 100 + conn / 10 + rt / 1000 };
          } catch {
            return { server: s, score: Infinity };
          }
        })
      );
      return scored.reduce((a, b) => (b.score < a.score ? b : a)).server;
    }

    default:
      return servers[0];
  }
};

// ── Auto-scaling ──────────────────────────────────────────────────────────────
const scaleUpServer = () => {
  const server = scalingServers.pop();
  if (server) {
    primaryServers.push(server);
    logEvent('SCALE_UP', `${server} promoted to primary. Active: ${primaryServers.length}`);
  } else {
    logEvent('SCALE_UP_FAIL', `No standby servers available to scale up.`);
  }
};

const scaleDownServer = (serverUrl) => {
  const idx = primaryServers.indexOf(serverUrl);
  if (idx > -1 && primaryServers.length > MIN_PRIMARY_SERVERS) {
    primaryServers.splice(idx, 1);
    scalingServers.push(serverUrl);
    logEvent('SCALE_DOWN', `${serverUrl} moved to standby. Active: ${primaryServers.length}`);
  }
};

const monitorCPUUsage = async () => {
  const usages = await Promise.all(
    primaryServers.map(async (server) => {
      try {
        const r = await get(`${server}/cpuUsage`, { timeout: 1000 });
        return { url: server, usage: r.data.usage };
      } catch {
        return { url: server, usage: 0 };
      }
    })
  );
  usages.forEach(({ url, usage }) => {
    if (usage > HIGH_USAGE_THRESHOLD)   scaleUpServer();
    else if (usage < LOW_USAGE_THRESHOLD) scaleDownServer(url);
  });
};

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Healthy', loadBalancer: `LB-${LB_PORT}` });
});

// Current pool & algorithm status
app.get('/status', (req, res) => {
  res.status(200).json({
    algorithm,
    primaryServers,
    scalingServers,
    totalActive:          primaryServers.length,
    totalStandby:         scalingServers.length,
    totalRequestsHandled,
  });
});

// Events log (last 30 events)
app.get('/events', (req, res) => {
  res.json({ events: eventLog.slice(0, 30) });
});

// Change algorithm at runtime
app.post('/changeAlgorithm', (req, res) => {
  const { algorithm: newAlgo } = req.body;
  const valid = [
    'Round Robin', 'Weighted Round Robin',
    'Least Connections', 'Least Response Time', 'Dynamic',
  ];
  if (!valid.includes(newAlgo)) {
    return res.status(400).json({ error: 'Invalid algorithm', valid });
  }
  const prev = algorithm;
  algorithm = newAlgo;
  roundRobinIndex = 0;
  logEvent('ALGO_CHANGE', `Algorithm changed from "${prev}" to "${algorithm}"`);
  res.json({ success: true, algorithm });
});

// Metrics for dashboard (includes response times)
app.get('/metrics', async (req, res) => {
  const metrics = {
    cpuUsages:            {},
    requestCounts:        {},
    responseTimes:        {},
    algorithm,
    primaryServers,
    scalingServers,
    totalRequestsHandled,
  };
  await Promise.all(
    primaryServers.map(async (server) => {
      try {
        const r = await get(`${server}/cpuUsage`, { timeout: 1000 });
        metrics.cpuUsages[server]     = r.data.usage;
        metrics.requestCounts[server] = connectionsCount[server] || 0;
        metrics.responseTimes[server] = responseTime[server]     || 0;
      } catch {
        metrics.cpuUsages[server]     = 0;
        metrics.requestCounts[server] = 0;
        metrics.responseTimes[server] = 0;
      }
    })
  );
  res.status(200).json(metrics);
});

// Original sendRequest (preserved for load-test UI)
app.post('/sendRequest', async (req, res) => {
  const healthData = await checkServerHealth();
  const servers = healthData.filter((s) => s.healthy).map((s) => s.url);
  if (servers.length === 0) return res.status(503).json({ message: 'No healthy servers available' });

  let selectedServer;
  try { selectedServer = await selectServer(servers); }
  catch (err) { return res.status(500).json({ message: 'Server selection failed', error: err.message }); }

  try {
    const startTime = Date.now();
    connectionsCount[selectedServer] = (connectionsCount[selectedServer] || 0) + 1;
    const response = await post(`${selectedServer}/processRequest`, { data: req.body.data, algorithm });
    const elapsed = Date.now() - startTime;
    responseTime[selectedServer] = elapsed;
    connectionsCount[selectedServer]--;
    totalRequestsHandled++;
    res.status(200).json({ ...response.data, selectedServer, algorithm, responseTimeMs: elapsed });
  } catch (error) {
    connectionsCount[selectedServer] = Math.max(0, (connectionsCount[selectedServer] || 1) - 1);
    res.status(500).json({ message: 'Request failed', error: error.message, selectedServer });
  }
});

// ── RESULT PORTAL: getResult ──────────────────────────────────────────────────
app.post('/getResult', async (req, res) => {
  const { rollNumber } = req.body;
  if (!rollNumber) return res.status(400).json({ error: 'rollNumber is required' });

  const healthData = await checkServerHealth();
  const servers = healthData.filter((s) => s.healthy).map((s) => s.url);
  if (servers.length === 0) return res.status(503).json({ error: 'No healthy servers available' });

  let selectedServer;
  try { selectedServer = await selectServer(servers); }
  catch (err) { return res.status(500).json({ error: 'Server selection failed' }); }

  try {
    const startTime = Date.now();
    connectionsCount[selectedServer] = (connectionsCount[selectedServer] || 0) + 1;
    const response = await post(`${selectedServer}/result`, { rollNumber });
    const elapsed = Date.now() - startTime;
    responseTime[selectedServer] = elapsed;
    connectionsCount[selectedServer]--;
    totalRequestsHandled++;

    console.log(`[LB-${LB_PORT}] Result for ${rollNumber} → ${selectedServer} [${algorithm}] (${elapsed}ms)`);
    res.status(200).json({ ...response.data, loadBalancer: `LB-${LB_PORT}`, algorithm, lbResponseTimeMs: elapsed });
  } catch (error) {
    connectionsCount[selectedServer] = Math.max(0, (connectionsCount[selectedServer] || 1) - 1);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: 'Server error while fetching result' });
  }
});

// ── Intervals ─────────────────────────────────────────────────────────────────
setInterval(monitorCPUUsage, 500);
setInterval(checkServerHealth, 10000);  // 10s for better demo responsiveness

app.listen(LB_PORT, () => {
  logEvent('STARTUP', `Load Balancer started on port ${LB_PORT}`);
  console.log(`[Result Flow] Load Balancer-1 listening at http://localhost:${LB_PORT}`);
});
