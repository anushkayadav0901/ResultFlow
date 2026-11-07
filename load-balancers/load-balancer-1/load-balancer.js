/**
 * Result Flow — Load Balancer 1 (Port 4001)
 * Author: Anushka Yadav
 * Cloud Computing Project — B.Tech CSE
 *
 * Algorithms: Round Robin, Weighted Round Robin, Least Connections,
 *             Least Response Time, Dynamic
 * Features:   Auto-scaling, Health Checks, /getResult portal route
 */

const express = require('express');
const cors = require('cors');
const { get, post } = require('axios');
const { readFileSync } = require('fs');

const app = express();
const LB_PORT = 4001;
app.use(cors());
app.use(express.json());

// ── Load config ───────────────────────────────────────────────────────────────
let algorithm = 'Round Robin';
let serverWeights = {};
let highUsageThreshold, lowUsageThreshold, minPrimaryServers;

try {
  const config = JSON.parse(readFileSync('./config.json', 'utf8'));
  algorithm        = config.algorithm        || algorithm;
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

const connectionsCount = {};
const responseTime = {};
let roundRobinIndex = 0;

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
  return results.map((r) =>
    r.status === 'fulfilled' ? r.value : { url: '', healthy: false }
  );
};

// ── Server selection (all algorithms in one place) ────────────────────────────
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

// ── Autoscaling ───────────────────────────────────────────────────────────────
const scaleUpServer = () => {
  const server = scalingServers.pop();
  if (server) {
    primaryServers.push(server);
    console.log(`[LB-${LB_PORT}] SCALE UP  → ${server} moved to primary pool.`);
  } else {
    console.log(`[LB-${LB_PORT}] No standby servers to scale up.`);
  }
};

const scaleDownServer = (serverUrl) => {
  const idx = primaryServers.indexOf(serverUrl);
  if (idx > -1 && primaryServers.length > MIN_PRIMARY_SERVERS) {
    primaryServers.splice(idx, 1);
    scalingServers.push(serverUrl);
    console.log(`[LB-${LB_PORT}] SCALE DOWN → ${serverUrl} moved to standby pool.`);
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
    totalActive:  primaryServers.length,
    totalStandby: scalingServers.length,
  });
});

// Change algorithm at runtime (used by dashboard & portal)
app.post('/changeAlgorithm', (req, res) => {
  const { algorithm: newAlgo } = req.body;
  const valid = [
    'Round Robin', 'Weighted Round Robin',
    'Least Connections', 'Least Response Time', 'Dynamic',
  ];
  if (!valid.includes(newAlgo)) {
    return res.status(400).json({ error: 'Invalid algorithm', valid });
  }
  algorithm = newAlgo;
  roundRobinIndex = 0;
  console.log(`[LB-${LB_PORT}] Algorithm changed to: ${algorithm}`);
  res.json({ success: true, algorithm });
});

// Metrics for dashboard
app.get('/metrics', async (req, res) => {
  const metrics = {
    cpuUsages:     {},
    requestCounts: {},
    algorithm,
    primaryServers,
    scalingServers,
  };
  await Promise.all(
    primaryServers.map(async (server) => {
      try {
        const r = await get(`${server}/cpuUsage`, { timeout: 1000 });
        metrics.cpuUsages[server]     = r.data.usage;
        metrics.requestCounts[server] = connectionsCount[server] || 0;
      } catch {
        metrics.cpuUsages[server]     = 0;
        metrics.requestCounts[server] = 0;
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

    console.log(`[LB-${LB_PORT}] Result for ${rollNumber} → ${selectedServer} [${algorithm}] (${elapsed}ms)`);
    res.status(200).json({ ...response.data, loadBalancer: `LB-${LB_PORT}`, algorithm, lbResponseTimeMs: elapsed });
  } catch (error) {
    connectionsCount[selectedServer] = Math.max(0, (connectionsCount[selectedServer] || 1) - 1);
    if (error.response) {
      // Forward 404 / 400 from backend as-is
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: 'Server error while fetching result' });
  }
});

// ── Intervals ─────────────────────────────────────────────────────────────────
setInterval(monitorCPUUsage, 500);
setInterval(checkServerHealth, 30000);

app.listen(LB_PORT, () => {
  console.log(`[Result Flow] Load Balancer-1 listening at http://localhost:${LB_PORT}`);
});
