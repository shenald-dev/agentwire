import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LoopDetector } from '../dist/core/loop-detector.js';

test('LoopDetector: identifies 3-step cycle oscillation (A -> B -> C -> A -> B -> C)', () => {
  const detector = new LoopDetector();

  const makeTool = (name, arg) => ({
    kind: 'tool_call',
    payload: { tool: name, arguments: { arg } }
  });

  // Cycle: search -> fetch -> parse -> search -> fetch -> parse
  assert.strictEqual(detector.evaluate(makeTool('search', 1)), null);
  assert.strictEqual(detector.evaluate(makeTool('fetch', 2)), null);
  assert.strictEqual(detector.evaluate(makeTool('parse', 3)), null);
  assert.strictEqual(detector.evaluate(makeTool('search', 1)), null);
  assert.strictEqual(detector.evaluate(makeTool('fetch', 2)), null);

  const alert = detector.evaluate(makeTool('parse', 3));
  assert.ok(alert, 'Expected loop alert on 3-step cycle completion');
  assert.strictEqual(alert?.type, 'cyclical_oscillation');
  assert.strictEqual(alert?.cyclePeriod, 3);
  assert.deepStrictEqual(alert?.cycleSequence, ['search', 'fetch', 'parse']);
});

test('LoopDetector: identifies error thrashing loops', () => {
  const detector = new LoopDetector();

  const errorEvent = {
    kind: 'error',
    summary: 'Connection timeout',
    payload: { isError: true }
  };

  assert.strictEqual(detector.evaluate(errorEvent), null);
  assert.strictEqual(detector.evaluate(errorEvent), null);
  const thrashAlert = detector.evaluate(errorEvent);

  assert.ok(thrashAlert, 'Expected error thrashing alert on 3 consecutive failures');
  assert.strictEqual(thrashAlert?.type, 'error_thrashing');
  assert.ok(thrashAlert?.message.includes('error thrashing'));
});
