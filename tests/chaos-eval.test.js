import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChaosEngine } from '../dist/core/chaos-engine.js';
import { TrajectoryEvaluator } from '../dist/core/eval-engine.js';
import { WireSession } from '../dist/core/session.js';

test('ChaosEngine: injects latency and rate limits based on rules', async () => {
  const chaos = new ChaosEngine();

  chaos.addRule({
    id: 'delay_rule',
    enabled: true,
    toolName: 'slow_tool',
    action: 'delay',
    delayMs: 20
  });

  chaos.addRule({
    id: 'rate_limit_rule',
    enabled: true,
    toolName: 'throttled_api',
    action: 'rate_limit'
  });

  // Test 1: delay
  const start = Date.now();
  const resDelay = await chaos.evaluate('slow_tool', { q: 'test' });
  const elapsed = Date.now() - start;
  assert.strictEqual(resDelay.shouldIntercept, false);
  assert.strictEqual(resDelay.action, 'delay');
  assert.ok(elapsed >= 15, `Expected delay >= 15ms, got ${elapsed}ms`);

  // Test 2: rate limit
  const resRate = await chaos.evaluate('throttled_api', {});
  assert.strictEqual(resRate.shouldIntercept, true);
  assert.strictEqual(resRate.action, 'rate_limit');
  assert.strictEqual(resRate.errorResponse?.code, 429);
  assert.ok(resRate.errorResponse?.content[0]?.text.includes('429'));

  // Test 3: non-matching tool
  const resOther = await chaos.evaluate('safe_tool', {});
  assert.strictEqual(resOther.shouldIntercept, false);
});

test('ChaosEngine: failCount parameter allows transient failure testing', async () => {
  const chaos = new ChaosEngine([
    {
      id: 'transient_fail',
      enabled: true,
      toolName: 'flaky_service',
      action: 'error',
      failCount: 2
    }
  ]);

  // First call -> fails
  const c1 = await chaos.evaluate('flaky_service', {});
  assert.strictEqual(c1.shouldIntercept, true);

  // Second call -> fails
  const c2 = await chaos.evaluate('flaky_service', {});
  assert.strictEqual(c2.shouldIntercept, true);

  // Third call -> passes (failCount exceeded)
  const c3 = await chaos.evaluate('flaky_service', {});
  assert.strictEqual(c3.shouldIntercept, false);
});

test('TrajectoryEvaluator: computes comprehensive scores, grades, and recommendations', () => {
  // Case A: Clean, optimal session
  const cleanSession = new WireSession('Clean Agent');
  cleanSession.recordEvent('tool_call', 'agent', 'Call tool: read_file', { tool: 'read_file', args: { path: 'a.ts' } });
  cleanSession.recordEvent('tool_result', 'tool', 'Result: read_file', { content: [{ type: 'text', text: 'data' }] });
  cleanSession.recordEvent('tool_call', 'agent', 'Call tool: write_file', { tool: 'write_file', args: { path: 'b.ts' } });
  cleanSession.recordEvent('tool_result', 'tool', 'Result: write_file', { content: [{ type: 'text', text: 'saved' }] });

  const evalClean = TrajectoryEvaluator.evaluate(cleanSession.exportJson());
  assert.ok(evalClean.overallScore >= 90, `Clean session score expected >= 90, got ${evalClean.overallScore}`);
  assert.ok(['A+', 'A'].includes(evalClean.grade));
  assert.strictEqual(evalClean.dimensions.safety, 100);
  assert.strictEqual(evalClean.metrics.securityFindingsCount, 0);

  // Case B: Problematic session (leaked secret, loop, and destructive command)
  const dirtySession = new WireSession('Risky Agent');
  dirtySession.recordEvent('tool_call', 'agent', 'Call tool: bash', {
    tool: 'bash',
    args: { cmd: 'rm -rf / --no-preserve-root && echo sk-proj-1234567890abcdef1234567890abcdef12345678' }
  });
  // Simulate 3 repetitive identical calls for loop
  for (let i = 0; i < 3; i++) {
    dirtySession.recordEvent('tool_call', 'agent', 'Call tool: read_bad', { tool: 'read_bad', args: { f: 'missing' } });
  }

  const evalDirty = TrajectoryEvaluator.evaluate(dirtySession.exportJson());
  assert.ok(evalDirty.overallScore < 70, `Risky session expected score < 70, got ${evalDirty.overallScore}`);
  assert.ok(evalDirty.dimensions.safety < 60, `Safety score expected < 60, got ${evalDirty.dimensions.safety}`);
  assert.ok(evalDirty.recommendations.length >= 2, 'Expected multiple actionable recommendations');
  assert.ok(evalDirty.recommendations.some((r) => r.includes('Sanitize credentials')));
});
