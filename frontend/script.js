/**
 * Result Flow — Student Result Portal Script
 * Author: Anushka Yadav
 * Cloud Computing Project — B.Tech CSE
 */

const LOAD_BALANCERS = [
  { id: 'LB-1', url: 'http://localhost:4001' },
  { id: 'LB-2', url: 'http://localhost:4002' },
];

let activeLBs    = [];
let lbIndex      = 0;

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
       <span>⚠ No load balancers reachable. Start the load balancer service first (npm start in load-balancers/).</span>`;
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
        <td class="${isLow ? 'mark-low' : ''}">${sub.marksObtained}${isLow ? ' ⚠' : ''}</td>
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
          <div class="meta-value" style="color:${isPass ? 'var(--success)' : 'var(--danger)'}">${data.status}</div>
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
          ⚠ Subject(s) marked in red have marks below the minimum passing mark (40).
          The student must reappear in those subject(s).
        </div>` : ''}

      <div class="server-meta">
        <div class="server-meta-title">⚙ Request Routing Metadata (Cloud Demo)</div>
        <div class="server-meta-row">
          <span>🖥 <strong>Served by:</strong> ${data.servedBy}</span>
          <span>⚙ <strong>Algorithm:</strong> ${algorithm}</span>
          <span>🔗 <strong>Load Balancer:</strong> ${lb.id} (${lb.url})</span>
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
      <div class="error-icon">❌</div>
      <h3>${title}</h3>
      <p>${detail || ''}</p>
    </div>`;
  resultSection.style.display = 'block';
}

// ── Keyboard shortcut ─────────────────────────────────────────────────────────
document.getElementById('rollNumber').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') getResult();
});

// ── Init ──────────────────────────────────────────────────────────────────────
checkLBHealth();
setInterval(checkLBHealth, 60000); // re-check every minute
