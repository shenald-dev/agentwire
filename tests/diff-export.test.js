import { test } from 'node:test';
import assert from 'node:assert';
import { TrajectoryDiff } from '../dist/core/diff-engine.js';
import { exportToMarkdown } from '../dist/exporters/markdown.js';
import { exportToHar } from '../dist/exporters/har.js';

function createMockSession(id, events, totalTokens = 500) {
  return {
    sessionId: id,
    agentName: `agent-${id}`,
    createdAt: 1700000000000,
    totalTokens,
    events
  };
}

function createEvent(stepIndex, kind, toolName, args = {}, tokens = 50) {
  return {
    id: `ev-${stepIndex}`,
    stepIndex,
    timestamp: 1700000000000 + stepIndex * 1000,
    kind,
    source: kind === 'tool_result' ? 'tool' : 'agent',
    summary: `${kind}: ${toolName || 'action'}`,
    payload: { tool: toolName, arguments: args },
    metrics: {
      totalEstimatedTokens: tokens,
      promptTokens: tokens,
      completionTokens: 0,
      toolCallTokens: tokens,
      toolResultTokens: 0
    }
  };
}

test('TrajectoryDiff: identical sessions report zero divergence', () => {
  const events = [
    createEvent(0, 'tool_call', 'read_file', { path: 'file1.txt' }),
    createEvent(1, 'tool_result', 'read_file', { content: 'hello' })
  ];

  const sessionA = createMockSession('sess-A', events, 100);
  const sessionB = createMockSession('sess-B', events, 100);

  const diff = TrajectoryDiff.compare(sessionA, sessionB);
  assert.strictEqual(diff.divergenceStepIndex, null);
  assert.strictEqual(diff.tokensDiff, 0);
  assert.strictEqual(diff.tokensPctChange, 0);
  assert.strictEqual(diff.identicalPrefixSteps, 2);
  assert.strictEqual(diff.errorsA, 0);
  assert.strictEqual(diff.errorsB, 0);
});

test('TrajectoryDiff: detects tool choice divergence and tokens delta', () => {
  const eventsA = [
    createEvent(0, 'tool_call', 'list_dir', { path: './' }),
    createEvent(1, 'tool_call', 'read_file', { path: 'a.txt' })
  ];

  const eventsB = [
    createEvent(0, 'tool_call', 'list_dir', { path: './' }),
    createEvent(1, 'tool_call', 'search_grep', { query: 'TODO' })
  ];

  const sessionA = createMockSession('sess-A', eventsA, 200);
  const sessionB = createMockSession('sess-B', eventsB, 500);

  const diff = TrajectoryDiff.compare(sessionA, sessionB);
  assert.strictEqual(diff.divergenceStepIndex, 1);
  assert.strictEqual(diff.identicalPrefixSteps, 1);
  assert.ok(diff.divergenceReason.includes("Tool choice diverged at step #1"));
  assert.strictEqual(diff.tokensDiff, 300);
  assert.strictEqual(diff.tokensPctChange, 150);
});

test('exportToMarkdown: generates diagnostic audit markdown', () => {
  const events = [
    createEvent(0, 'tool_call', 'read_file', { path: '../../etc/passwd' }), // security issue
    createEvent(1, 'error', 'read_file', { error: 'EACCES: permission denied' })
  ];

  const session = createMockSession('audit-sess', events, 1250);
  const md = exportToMarkdown(session, 'gpt-4o');

  assert.ok(md.includes('# ⚡ agentwire Trajectory Diagnostic Report'));
  assert.ok(md.includes('audit-sess'));
  assert.ok(md.includes('Total Steps'));
  assert.ok(md.includes('Security & Integrity Audit'));
  assert.ok(md.includes('path_traversal'));
  assert.ok(md.includes('Captured Failures & Exceptions'));
  assert.ok(md.includes('Execution Timeline'));
});

test('exportToHar: converts trajectory to standard HAR 1.2 format', () => {
  const events = [
    createEvent(0, 'tool_call', 'fetch_data', { url: 'https://example.com' }),
    createEvent(1, 'tool_result', 'fetch_data', { status: 200, body: 'ok' })
  ];

  const session = createMockSession('har-sess', events, 800);
  const har = exportToHar(session);

  assert.strictEqual(har.log.version, '1.2');
  assert.strictEqual(har.log.creator.name, 'agentwire');
  assert.strictEqual(har.log.creator.version, '0.2.0');
  assert.strictEqual(har.log.pages.length, 1);
  assert.strictEqual(har.log.pages[0].id, 'har-sess');
  assert.strictEqual(har.log.entries.length, 1);
  assert.strictEqual(har.log.entries[0].request.method, 'POST');
  assert.strictEqual(har.log.entries[0].request.url, 'mcp://agentwire/tools/fetch_data');
  assert.strictEqual(har.log.entries[0].response.status, 200);
});
