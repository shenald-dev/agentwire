import { test } from 'node:test';
import assert from 'node:assert';
import * as http from 'node:http';
import { WebServer } from '../dist/server/web-server.js';
import { WireSession } from '../dist/core/session.js';
import { BreakpointEngine } from '../dist/core/breakpoints.js';

function makeRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

test('WebServer: starts, serves UI, and handles REST & SSE API endpoints', async () => {
  const session = new WireSession('Server Test');
  session.recordEvent('prompt_turn', 'user', 'Initial prompt', { text: 'Hello agent' });
  const breakpointEngine = new BreakpointEngine();

  // Use port 0 for ephemeral OS-assigned port
  const server = new WebServer({ session, breakpointEngine, port: 0 });
  const actualPort = await server.start();
  assert.ok(actualPort > 0);

  const baseUrl = `http://localhost:${actualPort}`;

  // 1. Test GET / serves index.html
  const homeRes = await makeRequest(`${baseUrl}/`);
  assert.strictEqual(homeRes.status, 200);
  assert.ok(typeof homeRes.body === 'string' && homeRes.body.includes('agentwire'));

  // 2. Test GET /api/session
  const sessionRes = await makeRequest(`${baseUrl}/api/session`);
  assert.strictEqual(sessionRes.status, 200);
  assert.strictEqual(sessionRes.body.sessionId, session.id);
  assert.strictEqual(sessionRes.body.events.length, 1);

  // 3. Test POST /api/breakpoints
  const bpRes = await makeRequest(
    `${baseUrl}/api/breakpoints`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { id: 'bp_test', enabled: true, type: 'tool_name', pattern: 'bash', action: 'pause' }
  );
  assert.strictEqual(bpRes.status, 201);
  assert.strictEqual(bpRes.body.ok, true);
  assert.strictEqual(breakpointEngine.getRules().length, 1);

  // 4. Test POST /api/branch (Time-travel)
  const branchRes = await makeRequest(
    `${baseUrl}/api/branch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    },
    { stepIndex: 0, description: 'Test fork' }
  );
  assert.strictEqual(branchRes.status, 200);
  assert.strictEqual(branchRes.body.ok, true);
  assert.ok(branchRes.body.branch.branchId.startsWith('branch_'));

  await server.stop();
});
