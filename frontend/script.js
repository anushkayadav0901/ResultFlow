/**
 * Result Flow — Student Result Portal Script
 * Author: Anushka Yadav
 * Cloud Computing Project — B.Tech CSE
 */

const LOAD_BALANCERS = [
  { id: 'LB-1', url: 'http://localhost:4001' },
  { id: 'LB-2', url: 'http://localhost:4002' },
];

// All 15 demo roll numbers for Rush Hour simulation
const ALL_ROLL_NUMBERS = [
  'RF2101001','RF2101002','RF2101003','RF2101004','RF2101005',
  'RF2101006','RF2101007','RF2101008','RF2101009','RF2101010',
  'RF2101011','RF2101012','RF2101013','RF2101014','RF2101015',
];

let activeLBs = [];
let lbIndex   = 0;

// ── Load balancer health check ────────────────────────────────────────────────
async function checkLBHealth() {
  const statusBar = document.getElementById('statusBar');
  const btn       = document.getElementById('getResultBtn');
  activeLBs = [];

  for (const lb of LOAD_BALANCERS) {
    try {
      const res = await fetch(`${lb.url}/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) activeLBs.push(lb);
    } catch {
      /* unreachable — skip */
    }
  }

  if (activeLBs.length > 0) {
    statusBar.className = 'status-bar ok';
    statusBar.innerHTML =
      `<div class="status-dot"></div>
       <span>${activeLBs.length} load balancer(s) online — Ready to serve requests</span>`;
    btn.disabled = false;
  } else {
    statusBar.className = 'status-bar error';
    statusBar.innerHTML =
      `<div class="status-dot"></div>
       <span>❌ No load balancers reachable. Start the load balancer service first (npm start in load-balancers/).</span>`;
    btn.disabled = true;
  }
}

function getNextLB() {
  if (activeLBs.length === 0) throw new Error('No load balancers available');
  const lb = activeLBs[lbIndex % activeLBs.length];
  lbIndex++;
  return lb;
}

// ── Main: fetch result ────────────────────────────────────────────────────────
async function getResult() {
  const rollNumber = document.getElementById('rollNumber').value.trim();
  const algorithm  = document.getElementById('algorithm').value;

  if (!rollNumber) {
    showError('Please enter a roll number.', 'Roll number field cannot be empty.');
    return;
  }

  const btn           = document.getElementById('getResultBtn');
  const resultSection = document.getElementById('resultSection');
  btn.disabled        = true;
  btn.innerHTML       = '<span class="loader"></span> Fetching…';
  resultSection.style.display = 'none';

  try {
    const lb = getNextLB();

    // Push selected algorithm to both load balancers (best-effort, non-blocking)
    for (const activeLB of activeLBs) {
      fetch(`${activeLB.url}/changeAlgorithm`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ algorithm }),
      }).catch(() => {});
    }

    const start    = Date.now();
    const response = await fetch(`${lb.url}/getResult`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rollNumber }),
    });
    const elapsed = Date.now() - start;
    const data    = await response.json();

    if (!response.ok) {
      showError(
        data.error || `Error ${response.status}`,
        `Roll number "${rollNumber.toUpperCase()}" was not found in the database.`
      );
      return;
    }

    renderResult(data, lb, algorithm, elapsed);
  } catch (err) {
    showError(
      'Connection failed.',
      'Could not reach the load balancer. Make sure all services are running.'
    );
    console.error(err);
  } finally {
    btn.disabled  = false;
    btn.innerHTML = 'Get Result';
    checkLBHealth();
  }
}

// ── Render result card ────────────────────────────────────────────────────────
function renderResult(data, lb, algorithm, clientElapsed) {
  const isPass = data.status === 'Pass';

  let subjectRows = '';
  let idx = 1;
  for (const sub of data.subjects) {
    const isLow = sub.marksObtained < 40;
    subjectRows += `
      <tr>
        <td>${idx++}</td>
        <td>${sub.name}</td>
        <td style="text-align:center;">${sub.maxMarks}</td>
        <td class="${isLow ? 'mark-low' : ''}">${sub.marksObtained}${isLow ? ' ❌' : ''}</td>
      </tr>`;
  }

  const html = `
    <div class="result-header ${isPass ? 'pass' : 'fail'}">
      <div>
        <div class="student-name">${data.name}</div>
        <div class="student-sub">
          Roll No: <strong>${data.rollNumber}</strong> &nbsp;|&nbsp;
          ${data.course} &nbsp;|&nbsp; Semester ${data.semester}
        </div>
      </div>
      <div class="result-badge ${isPass ? 'pass' : 'fail'}">${data.status.toUpperCase()}</div>
    </div>

    <div class="result-body">
      <div class="meta-row">
        <div class="meta-box">
          <div class="meta-label">Total Marks</div>
          <div class="meta-value">${data.total} / ${data.maxTotal}</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Percentage</div>
          <div class="meta-value">${data.percentage}%</div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Result</div>
          <div class="meta-value" style="color:${isPass ? 'var(--success)' : 'var(--danger)'}">
            ${data.status}
          </div>
        </div>
        <div class="meta-box">
          <div class="meta-label">Semester</div>
          <div class="meta-value">Sem ${data.semester}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Subject Name</th>
            <th style="text-align:center;">Max Marks</th>
            <th style="text-align:center;">Marks Obtained</th>
          </tr>
        </thead>
        <tbody>${subjectRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="2">Total</td>
            <td style="text-align:center;">${data.maxTotal}</td>
            <td style="text-align:center;">${data.total}</td>
          </tr>
        </tfoot>
      </table>

      ${!isPass ? `
        <div class="fail-notice">
          ❌ Subject(s) marked in red have marks below the minimum passing mark (40).
          The student must reappear in those subject(s).
        </div>` : ''}

      <div class="server-meta">
        <div class="server-meta-title">🖥 Request Routing Metadata (Cloud Demo)</div>
        <div class="server-meta-row">
          <span>🖧 <strong>Served by:</strong> ${data.servedBy}</span>
          <span>⚖ <strong>Algorithm:</strong> ${algorithm}</span>
          <span>🔀 <strong>Load Balancer:</strong> ${lb.id} (${lb.url})</span>
          <span>⏱ <strong>Response Time:</strong> ${clientElapsed}ms</span>
          <span>🕐 <strong>At:</strong> ${new Date(data.timestamp).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>`;

  const resultSection = document.getElementById('resultSection');
  resultSection.innerHTML = html;
  resultSection.style.display = 'block';
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Error display ─────────────────────────────────────────────────────────────
function showError(title, detail) {
  const resultSection = document.getElementById('resultSection');
  resultSection.innerHTML = `
    <div class="error-state">
      <div class="error-icon">⚠️</div>
      <h3>${title}</h3>
      <p>${detail || ''}</p>
    </div>`;
  resultSection.style.display = 'block';
}

// ── Rush Hour Simulation ──────────────────────────────────────────────────────
async function simulateRushHour(count = 20) {
  if (activeLBs.length === 0) {
    alert('No load balancers are online. Please start the services first.');
    return;
  }

  const rushBtn    = document.getElementById('rushBtn');
  const rushSection = document.getElementById('rushSection');
  rushBtn.disabled  = true;
  rushBtn.textContent = '⏳ Simulating…';
  rushSection.style.display = 'none';

  // Build request list by cycling through roll numbers & LBs
  const requests = [];
  for (let i = 0; i < count; i++) {
    const rollNumber = ALL_ROLL_NUMBERS[i % ALL_ROLL_NUMBERS.length];
    const lb         = activeLBs[i % activeLBs.length];
    requests.push({ rollNumber, lb });
  }

  // Fire all in parallel
  const start   = Date.now();
  const results = await Promise.all(
    requests.map(async ({ rollNumber, lb }) => {
      const t0 = Date.now();
      try {
        const res  = await fetch(`${lb.url}/getResult`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ rollNumber }),
          signal:  AbortSignal.timeout(8000),
        });
        const data = await res.json();
        return {
          rollNumber,
          name:       data.name       || '—',
          servedBy:   data.servedBy   || '—',
          lbId:       lb.id,
          elapsed:    Date.now() - t0,
          status:     res.ok ? (data.status || 'OK') : 'Error',
          ok:         res.ok,
        };
      } catch (err) {
        return { rollNumber, name: '—', servedBy: '—', lbId: lb.id, elapsed: Date.now() - t0, status: 'Timeout', ok: false };
      }
    })
  );

  rushBtn.disabled    = false;
  rushBtn.textContent = '🔥 Rush Hour (20 students)';
  renderRushResults(results, Date.now() - start);
}

function renderRushResults(results, totalMs) {
  const successful = results.filter((r) => r.ok).length;
  const failed     = results.length - successful;
  const avgTime    = Math.round(results.reduce((s, r) => s + r.elapsed, 0) / results.length);

  // Count per server
  const serverCounts = {};
  results.forEach((r) => {
    if (r.servedBy && r.servedBy !== '—') {
      serverCounts[r.servedBy] = (serverCounts[r.servedBy] || 0) + 1;
    }
  });
  const maxCount = Math.max(1, ...Object.values(serverCounts));

  // Distribution bars
  let distHtml = '';
  for (const [srv, cnt] of Object.entries(serverCounts).sort()) {
    const pct = Math.round((cnt / results.length) * 100);
    const barW = Math.round((cnt / maxCount) * 100);
    distHtml += `
      <div class="dist-row">
        <div class="dist-server">${srv}</div>
        <div class="dist-bar-wrap">
          <div class="dist-bar" style="width:${barW}%"></div>
        </div>
        <div class="dist-label">${cnt} req (${pct}%)</div>
      </div>`;
  }

  // Results table
  let tableRows = '';
  results.forEach((r) => {
    tableRows += `
      <tr>
        <td>${r.rollNumber}</td>
        <td>${r.name}</td>
        <td><span class="badge-server">${r.servedBy}</span></td>
        <td>${r.lbId}</td>
        <td>${r.elapsed}ms</td>
        <td style="color:${r.ok ? 'var(--success)' : 'var(--danger)'}">
          ${r.status}
        </td>
      </tr>`;
  });

  const rushSection = document.getElementById('rushSection');
  rushSection.innerHTML = `
    <div class="rush-header">
      <h3>🔥 Rush Hour Results</h3>
      <div class="rush-stats">
        <div class="rush-stat">
          <div class="rush-stat-val" style="color:var(--success)">${successful}</div>
          <div class="rush-stat-label">Successful</div>
        </div>
        <div class="rush-stat">
          <div class="rush-stat-val" style="color:var(--danger)">${failed}</div>
          <div class="rush-stat-label">Failed</div>
        </div>
        <div class="rush-stat">
          <div class="rush-stat-val">${avgTime}ms</div>
          <div class="rush-stat-label">Avg Time</div>
        </div>
        <div class="rush-stat">
          <div class="rush-stat-val">${results.length}</div>
          <div class="rush-stat-label">Total Requests</div>
        </div>
      </div>
    </div>

    <div class="dist-section">
      <div class="dist-title">📊 Request Distribution by Server</div>
      ${distHtml || '<p style="color:#aaa;padding:8px 0;">No distribution data (all failed)</p>'}
    </div>

    <div class="rush-table-wrap">
      <table class="rush-table">
        <thead>
          <tr>
            <th>Roll No</th><th>Name</th><th>Server</th>
            <th>LB</th><th>Time</th><th>Status</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
  rushSection.style.display = 'block';
  rushSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ── Failure Simulation ────────────────────────────────────────────────────────
function showFailureControls() {
  document.getElementById('failureControls').style.display = 'block';
}

async function confirmServerFailure() {
  const serverPort = document.getElementById('failureServerPort').value;
  const duration   = parseInt(document.getElementById('failureDuration').value, 10);
  try {
    const res = await fetch(`http://localhost:${serverPort}/simulate-failure`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ duration }),
    });
    if (res.ok) {
      document.getElementById('failureControls').style.display = 'none';
      showToast(`⚠️ Server-${serverPort} simulating failure for ${duration}s. Health check will detect it in ~10s.`);
    } else {
      showToast(`❌ Could not reach Server-${serverPort}. Is it running?`);
    }
  } catch {
    showToast(`❌ Could not reach Server-${serverPort}. Is it running?`);
  }
}

async function recoverServer(port) {
  const serverPort = port || document.getElementById('failureServerPort').value;
  try {
    await fetch(`http://localhost:${serverPort}/recover`, { method: 'POST' });
    showToast(`✅ Server-${serverPort} manually recovered.`);
  } catch {
    showToast(`❌ Could not reach Server-${serverPort}.`);
  }
  document.getElementById('failureControls').style.display = 'none';
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
document.getElementById('rollNumber').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') getResult();
});

// ── Init ──────────────────────────────────────────────────────────────────────
checkLBHealth();
setInterval(checkLBHealth, 60000); // re-check every minute
