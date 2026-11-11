
const express = require('express');
const { json } = require('express');
const { cpus: _cpus } = require('os');
const { argv } = require('node:process');
const { readFileSync } = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const port = argv[argv.length - 1];

app.use(cors());
app.use(json());

let activeConnections = 0;
let lastCpuTimes = _cpus().map((cpu) => cpu.times);

// ── Failure simulation state ──────────────────────────────────────────────────
let failureSimulationActive = false;
let failureSimulationTimeout = null;
let failureRecoveryAt = null;

// ── Load student data once at startup ─────────────────────────────────────────
let studentData = [];
try {
  const raw = readFileSync(path.join(__dirname, '../data/students.json'), 'utf8');
  studentData = JSON.parse(raw);
  console.log(`[Server-${port}] Loaded ${studentData.length} student records.`);
} catch (err) {
  console.error(`[Server-${port}] Could not load student data:`, err.message);
}

// ── CPU helpers ───────────────────────────────────────────────────────────────
function simulateHeavyComputation() {
  const start = Date.now();
  const duration = 300 + 500 * Math.random();
  while (Date.now() - start < duration) { Math.random(); }
}

function getCPUUsage() {
  const cpus = _cpus();
  let totalDiff = 0;
  let idleDiff = 0;
  cpus.forEach((cpu, index) => {
    const { user, nice, sys, idle, irq } = cpu.times;
    const last = lastCpuTimes[index];
    const total = user + nice + sys + idle + irq;
    const lastTotal = last.user + last.nice + last.sys + last.idle + last.irq;
    totalDiff += total - lastTotal;
    idleDiff += idle - last.idle;
    lastCpuTimes[index] = cpu.times;
  });
  return totalDiff === 0 ? 0 : 100 - Math.floor((idleDiff / totalDiff) * 100);
}

const monitorCPUUsage = () => {
  setInterval(() => { getCPUUsage(); }, 5000);
};

// ── Routes ────────────────────────────────────────────────────────────────────

// Health — returns Unhealthy during failure simulation (for demo)
app.get('/health', (req, res) => {
  if (failureSimulationActive) {
    return res.status(503).json({
      status: 'Unhealthy',
      server: `Server-${port}`,
      reason: 'Failure simulation active',
      recoversAt: failureRecoveryAt,
    });
  }
  res.status(200).json({ status: 'Healthy', server: `Server-${port}` });
});

app.get('/cpuUsage', (req, res) => {
  res.status(200).json({ usage: getCPUUsage() });
});

app.get('/activeConnections', (req, res) => {
  res.status(200).json({ activeConnections });
});

// Original generic request handler (preserved)
app.post('/processRequest', (req, res) => {
  activeConnections++;
  const { data } = req.body;
  if (!data) {
    activeConnections--;
    return res.status(400).json({ message: 'No data provided' });
  }
  try {
    simulateHeavyComputation();
    res.status(200).json({
      message: `Processed request with data: ${JSON.stringify(data)}, Server: ${port}`,
      server: `Server-${port}`,
      requestNumber: activeConnections,
    });
  } catch (error) {
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  } finally {
    activeConnections--;
  }
});

// ── Result Portal: fetch student result ───────────────────────────────────────
app.post('/result', (req, res) => {
  const { rollNumber } = req.body;
  if (!rollNumber) {
    return res.status(400).json({ error: 'Roll number is required' });
  }
  const student = studentData.find(
    (s) => s.rollNumber === rollNumber.trim().toUpperCase()
  );
  if (!student) {
    return res.status(404).json({
      error: `No result found for roll number: ${rollNumber.trim().toUpperCase()}`,
    });
  }
  res.status(200).json({
    ...student,
    servedBy: `Server-${port}`,
    timestamp: new Date().toISOString(),
  });
});

// ── Failure simulation (DEMO feature) ────────────────────────────────────────
app.post('/simulate-failure', (req, res) => {
  const { duration = 30 } = req.body;
  failureSimulationActive = true;
  failureRecoveryAt = new Date(Date.now() + duration * 1000).toISOString();
  console.log(`[Server-${port}] 🔴 Simulating failure for ${duration}s`);
  if (failureSimulationTimeout) clearTimeout(failureSimulationTimeout);
  failureSimulationTimeout = setTimeout(() => {
    failureSimulationActive = false;
    failureRecoveryAt = null;
    console.log(`[Server-${port}] 🟢 Auto-recovered from simulated failure`);
  }, duration * 1000);
  res.json({ message: `Server-${port} simulating failure for ${duration}s`, recoversAt: failureRecoveryAt });
});

// Manual recovery
app.post('/recover', (req, res) => {
  if (failureSimulationTimeout) clearTimeout(failureSimulationTimeout);
  failureSimulationActive = false;
  failureRecoveryAt = null;
  console.log(`[Server-${port}] 🟢 Manually recovered`);
  res.json({ message: `Server-${port} is now Healthy` });
});

monitorCPUUsage();

app.listen(port, () => {
  console.log(`[Result Flow] Application Server-${port} listening at http://localhost:${port}`);
});
