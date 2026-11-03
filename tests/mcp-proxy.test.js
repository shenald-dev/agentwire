import { test } from 'node:test';
import assert from 'node:assert';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpProxy } from '../dist/proxy/mcp-proxy.js';
import { WireSession } from '../dist/core/session.js';
import { BreakpointEngine } from '../dist/core/breakpoints.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('McpProxy: intercepts JSON-RPC messages and records events', async () => {
  const session = new WireSession('MCP Test');
  const breakpointEngine = new BreakpointEngine();

  const mockAgentIn = new PassThrough();
  const mockAgentOut = new PassThrough();

  const mockServerPath = path.resolve(__dirname, 'fixtures/mock-mcp-server.js');

  const proxy = new McpProxy({
    session,
    breakpointEngine,
    command: process.execPath,
    args: [mockServerPath]
  });

  proxy.start(mockAgentIn, mockAgentOut);

  // Send a tools/call request
  const requestJson = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'read_file',
      arguments: { path: '/test.txt' }
    }
  };

  const responsePromise = new Promise((resolve) => {
    mockAgentOut.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (!line) return;
      try {
        const res = JSON.parse(line);
        if (res.id === 1) {
          assert.strictEqual(res.result.content[0].text, 'mock-output');
          resolve();
        }
      } catch {
        // Ignore non-json
      }
    });
  });

  mockAgentIn.write(JSON.stringify(requestJson) + '\n');

  await responsePromise;

  // Verify recorded wire events in session
  const events = session.getEvents();
  assert.ok(events.length >= 2, `Expected at least 2 events, got ${events.length}`);

  const toolCallEvent = events.find((e) => e.kind === 'tool_call');
  assert.ok(toolCallEvent);
  assert.strictEqual(toolCallEvent.payload.tool, 'read_file');

  const toolResultEvent = events.find((e) => e.kind === 'tool_result');
  assert.ok(toolResultEvent);

  proxy.stop();
});
