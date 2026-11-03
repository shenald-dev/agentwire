import { test } from 'node:test';
import assert from 'node:assert';
import * as http from 'node:http';
import { HttpProxy } from '../dist/proxy/http-proxy.js';
import { WireSession } from '../dist/core/session.js';
import { BreakpointEngine } from '../dist/core/breakpoints.js';
import { MockEngine } from '../dist/core/mock-engine.js';

function createServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

function sendJsonRequest(port, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        }
      },
      (res) => {
        let resBody = '';
        res.on('data', (c) => (resBody += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(resBody) });
          } catch {
            resolve({ status: res.statusCode, raw: resBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

test('HttpProxy: intercepts HTTP traffic and forwards upstream', async () => {
  let upstreamHits = 0;
  const { server: upstreamServer, port: upstreamPort } = await createServer((req, res) => {
    upstreamHits++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { echo: 'upstream_data' } }));
  });

  const session = new WireSession('http-test', 'http-agent');
  const breakpoints = new BreakpointEngine();
  const mockEngine = new MockEngine();

  const proxy = new HttpProxy({
    session,
    breakpointEngine: breakpoints,
    mockEngine,
    targetUrl: `http://127.0.0.1:${upstreamPort}`,
    listenPort: 0
  });

  const proxyPort = await proxy.start();
  assert.ok(proxyPort > 0);

  try {
    // 1. Regular upstream call
    const res1 = await sendJsonRequest(proxyPort, '/mcp', {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'real_tool', arguments: { query: 'hello' } }
    });

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.data.result.echo, 'upstream_data');
    assert.strictEqual(upstreamHits, 1);

    // 2. Mocked call: should NOT hit upstream
    mockEngine.addMock({
      id: 'mock-1',
      enabled: true,
      toolName: 'virtual_tool',
      response: { injected: true }
    });

    const res2 = await sendJsonRequest(proxyPort, '/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'virtual_tool', arguments: {} }
    });

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.data.result.injected, true);
    assert.strictEqual(upstreamHits, 1); // still 1!

    // Verify session events recorded
    const events = session.getEvents();
    assert.ok(events.length >= 3);
  } finally {
    await proxy.stop();
    await new Promise((r) => upstreamServer.close(r));
  }
});
