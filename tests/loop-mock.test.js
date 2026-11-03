import { test } from 'node:test';
import assert from 'node:assert';
import { LoopDetector } from '../dist/core/loop-detector.js';
import { MockEngine } from '../dist/core/mock-engine.js';

test('LoopDetector: identifies consecutive identical tool invocations', () => {
  const detector = new LoopDetector(3);

  const event1 = {
    id: 'evt-1',
    sequence: 1,
    timestamp: Date.now(),
    direction: 'inbound',
    protocol: 'jsonrpc',
    kind: 'tool_call',
    payload: { tool: 'fetch_data', args: { url: 'https://api.example.com/status' } },
    tokenMetrics: { totalEstimatedTokens: 20, promptTokens: 20, completionTokens: 0, deltaTokens: 20 }
  };

  assert.strictEqual(detector.evaluate(event1), null);
  assert.strictEqual(detector.evaluate(event1), null);

  // 3rd consecutive call triggers loop alert
  const alert = detector.evaluate(event1);
  assert.ok(alert !== null);
  assert.strictEqual(alert.type, 'identical_repeat');
  assert.strictEqual(alert.toolName, 'fetch_data');
  assert.strictEqual(alert.repeatCount, 3);
  assert.ok(alert.message.includes("called 'fetch_data' with identical arguments"));
});

test('LoopDetector: identifies cyclical oscillation between tools (A <-> B)', () => {
  const detector = new LoopDetector(3);

  const callA = {
    id: 'a',
    sequence: 1,
    timestamp: Date.now(),
    direction: 'inbound',
    protocol: 'jsonrpc',
    kind: 'tool_call',
    payload: { tool: 'inspect_repo', args: { dir: './src' } },
    tokenMetrics: { totalEstimatedTokens: 20, promptTokens: 20, completionTokens: 0, deltaTokens: 20 }
  };

  const callB = {
    id: 'b',
    sequence: 2,
    timestamp: Date.now(),
    direction: 'inbound',
    protocol: 'jsonrpc',
    kind: 'tool_call',
    payload: { tool: 'list_commits', args: { branch: 'main' } },
    tokenMetrics: { totalEstimatedTokens: 20, promptTokens: 20, completionTokens: 0, deltaTokens: 20 }
  };

  // Alternating: A, B, A, B, A, B
  assert.strictEqual(detector.evaluate(callA), null);
  assert.strictEqual(detector.evaluate(callB), null);
  assert.strictEqual(detector.evaluate(callA), null);
  assert.strictEqual(detector.evaluate(callB), null);
  assert.strictEqual(detector.evaluate(callA), null);

  const alert = detector.evaluate(callB);
  assert.ok(alert !== null);
  assert.strictEqual(alert.type, 'cyclical_oscillation');
  assert.deepStrictEqual(alert.cycleSequence, ['inspect_repo', 'list_commits']);
  assert.ok(alert.message.includes('oscillating between tools'));
});

test('LoopDetector: resets state when cleared', () => {
  const detector = new LoopDetector(3);
  const event = {
    id: 'evt-1',
    sequence: 1,
    timestamp: Date.now(),
    direction: 'inbound',
    protocol: 'jsonrpc',
    kind: 'tool_call',
    payload: { tool: 'ping', args: {} },
    tokenMetrics: { totalEstimatedTokens: 10, promptTokens: 10, completionTokens: 0, deltaTokens: 10 }
  };

  detector.evaluate(event);
  detector.evaluate(event);
  detector.reset();

  // After reset, 1 call shouldn't trigger
  assert.strictEqual(detector.evaluate(event), null);
});

test('MockEngine: matches tool by name and regex arguments', () => {
  const engine = new MockEngine([
    {
      id: 'mock-weather',
      enabled: true,
      toolName: 'get_weather',
      argPattern: 'tokyo',
      response: { temperature: 22, condition: 'Sunny' },
      description: 'Mock Tokyo weather'
    },
    {
      id: 'mock-db',
      enabled: false,
      toolName: 'query_db',
      response: { rows: [] }
    }
  ]);

  // Match positive case
  const match1 = engine.match('get_weather', { city: 'Tokyo' });
  assert.ok(match1 !== null);
  assert.strictEqual(match1.id, 'mock-weather');
  assert.deepStrictEqual(match1.response, { temperature: 22, condition: 'Sunny' });

  // Negative case: different args
  const match2 = engine.match('get_weather', { city: 'London' });
  assert.strictEqual(match2, null);

  // Negative case: disabled mock
  const match3 = engine.match('query_db', { sql: 'SELECT 1' });
  assert.strictEqual(match3, null);

  // Dynamically add and remove mock
  engine.addMock({
    id: 'mock-calc',
    enabled: true,
    toolName: 'calculator',
    response: { result: 42 }
  });

  const match4 = engine.match('calculator', {});
  assert.ok(match4 !== null);
  assert.strictEqual(match4.response.result, 42);

  const removed = engine.removeMock('mock-calc');
  assert.strictEqual(removed, true);
  assert.strictEqual(engine.match('calculator', {}), null);
});
