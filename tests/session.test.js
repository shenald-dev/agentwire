import { test } from 'node:test';
import assert from 'node:assert';
import { WireSession } from '../dist/core/session.js';

test('WireSession: records events and updates total token counts', () => {
  const session = new WireSession('Test Agent');
  assert.ok(session.id.startsWith('wire_'));

  const ev1 = session.recordEvent('prompt_turn', 'user', 'Analyze this codebase', { prompt: 'Analyze this codebase' });
  assert.strictEqual(ev1.stepIndex, 0);
  assert.strictEqual(ev1.kind, 'prompt_turn');
  assert.ok(session.getTotalTokens() > 0);

  const ev2 = session.recordEvent('tool_call', 'agent', 'Call bash tool', { name: 'bash', args: { cmd: 'git status' } });
  assert.strictEqual(ev2.stepIndex, 1);
  assert.strictEqual(session.getEvents().length, 2);
});

test('WireSession: time-travel branching forks history accurately', () => {
  const session = new WireSession('Branching Test');
  session.recordEvent('prompt_turn', 'user', 'Step 0', { text: 'Step 0' });
  session.recordEvent('tool_call', 'agent', 'Step 1', { text: 'Step 1' });
  session.recordEvent('tool_result', 'tool', 'Step 2', { text: 'Step 2' });
  session.recordEvent('prompt_turn', 'agent', 'Step 3', { text: 'Step 3' });

  assert.strictEqual(session.getEvents().length, 4);

  // Rewind to step 1 and branch
  const branch = session.branchFromStep(1, 'Alternative fix');
  assert.ok(branch.branchId.startsWith('branch_'));
  assert.strictEqual(branch.parentStepIndex, 1);

  // Trajectory truncated to step 0 and 1
  assert.strictEqual(session.getEvents().length, 2);
  assert.strictEqual(session.getEvents()[1].stepIndex, 1);
});

test('WireSession: exportJson and importJson serializes faithfully', () => {
  const session = new WireSession('Serialization Test');
  session.recordEvent('prompt_turn', 'user', 'Prompt', { prompt: 'Hello' });
  session.recordEvent('tool_call', 'agent', 'Tool', { tool: 'search' });

  const json = session.exportJson();
  assert.strictEqual(json.events.length, 2);
  assert.strictEqual(json.agentName, 'Serialization Test');

  const rehydrated = WireSession.importJson(json);
  assert.strictEqual(rehydrated.id, session.id);
  assert.strictEqual(rehydrated.getEvents().length, 2);
  assert.strictEqual(rehydrated.getTotalTokens(), session.getTotalTokens());
});
