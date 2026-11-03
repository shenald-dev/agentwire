import { test } from 'node:test';
import assert from 'node:assert';
import { BreakpointEngine } from '../dist/core/breakpoints.js';
import { WireSession } from '../dist/core/session.js';

test('BreakpointEngine: matches tool_name rule and triggers pause', async () => {
  const engine = new BreakpointEngine([
    {
      id: 'bp_bash',
      enabled: true,
      type: 'tool_name',
      pattern: 'bash',
      action: 'pause'
    }
  ]);

  const session = new WireSession();
  const event = session.recordEvent('tool_call', 'agent', 'Call bash', { name: 'bash', args: { cmd: 'ls' } });

  // Start evaluation (will pause)
  const evalPromise = engine.evaluate(event);

  const pending = engine.getPendingPauses();
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].rule.id, 'bp_bash');

  // Resume evaluation
  engine.resume(pending[0].hitId, 'continue');
  const result = await evalPromise;

  assert.strictEqual(result.shouldPause, true);
  assert.strictEqual(result.aborted, undefined);
});

test('BreakpointEngine: tool_arg_regex matches dangerous commands and mutates payload', async () => {
  const engine = new BreakpointEngine([
    {
      id: 'bp_rm',
      enabled: true,
      type: 'tool_arg_regex',
      pattern: 'rm\\s+-rf',
      action: 'pause'
    }
  ]);

  const session = new WireSession();
  const event = session.recordEvent('tool_call', 'agent', 'Delete directory', {
    tool: 'execute_command',
    args: { cmd: 'rm -rf /critical/data' }
  });

  const evalPromise = engine.evaluate(event);

  const pending = engine.getPendingPauses();
  assert.strictEqual(pending.length, 1);

  // User decides to modify the arguments to a safe command
  const safePayload = { cmd: 'ls -la /critical/data' };
  engine.resume(pending[0].hitId, 'modify', safePayload);

  const result = await evalPromise;
  assert.strictEqual(result.shouldPause, true);
  assert.deepStrictEqual(result.modifiedPayload, safePayload);
});

test('BreakpointEngine: block action aborts without pause prompt', async () => {
  const engine = new BreakpointEngine([
    {
      id: 'bp_block_sudo',
      enabled: true,
      type: 'tool_arg_regex',
      pattern: 'sudo',
      action: 'block'
    }
  ]);

  const session = new WireSession();
  const event = session.recordEvent('tool_call', 'agent', 'Run sudo', {
    args: { cmd: 'sudo reboot' }
  });

  const result = await engine.evaluate(event);
  assert.strictEqual(result.aborted, true);
});
