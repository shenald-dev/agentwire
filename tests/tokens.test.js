import { test } from 'node:test';
import assert from 'node:assert';
import { estimateTokens, computeEventMetrics, formatTokenCount } from '../dist/utils/tokens.js';

test('estimateTokens: calculates token estimates for strings and code', () => {
  assert.strictEqual(estimateTokens(''), 0);
  assert.strictEqual(estimateTokens(null), 0);

  const english = 'Hello world, this is a test.';
  const est1 = estimateTokens(english);
  assert.ok(est1 >= 5 && est1 <= 10, `Expected ~7 tokens, got ${est1}`);

  const codeSnippet = 'function add(a: number, b: number): number { return a + b; }';
  const est2 = estimateTokens(codeSnippet);
  assert.ok(est2 >= 15 && est2 <= 25, `Expected ~18 tokens, got ${est2}`);
});

test('estimateTokens: estimates tokens for nested JSON objects', () => {
  const jsonPayload = {
    method: 'tools/call',
    params: {
      name: 'execute_command',
      arguments: { cmd: 'npm test --verbose' }
    }
  };
  const tokens = estimateTokens(jsonPayload);
  assert.ok(tokens > 15, `Expected > 15 tokens for JSON structure, got ${tokens}`);
});

test('computeEventMetrics: calculates granular token metrics', () => {
  const metrics = computeEventMetrics('tool_call', { name: 'bash', args: { cmd: 'ls -la' } }, 100);
  assert.ok(metrics.toolCallTokens > 0);
  assert.strictEqual(metrics.promptTokens, 0);
  assert.strictEqual(metrics.totalEstimatedTokens, metrics.toolCallTokens);
  assert.ok(metrics.turnPercentage && metrics.turnPercentage > 0);
});

test('formatTokenCount: formats token numbers into human badges', () => {
  assert.strictEqual(formatTokenCount(250), '250 tk');
  assert.strictEqual(formatTokenCount(1500), '1.5k tk');
  assert.strictEqual(formatTokenCount(2500000), '2.5M tk');
});
