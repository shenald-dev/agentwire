import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.resolve(__dirname, '../bin/agentwire.js');

function runCliCmd(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

test('CLI: eval command evaluates trajectory SLA scorecard', async () => {
  const tmpFile = path.join(os.tmpdir(), `agentwire_test_eval_${Date.now()}.json`);
  const session = {
    version: '1.0.0',
    sessionId: 'eval_session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalTokens: 1500,
    events: [
      {
        id: 'ev_1',
        stepIndex: 0,
        timestamp: Date.now(),
        kind: 'tool_call',
        source: 'agent',
        summary: 'Call tool: safe_query',
        payload: { tool: 'safe_query', arguments: { id: 1 } },
        metrics: { totalEstimatedTokens: 50, promptTokens: 0, completionTokens: 0, toolCallTokens: 50, toolResultTokens: 0 }
      }
    ],
    branches: [],
    breakpoints: []
  };

  fs.writeFileSync(tmpFile, JSON.stringify(session, null, 2), 'utf-8');

  try {
    const { code, stdout } = await runCliCmd(['eval', tmpFile, '--threshold', '70']);
    assert.strictEqual(code, 0);
    assert.ok(stdout.includes('agentwire Trajectory Evaluation'));
    assert.ok(stdout.includes('Safety & Integrity'));
    assert.ok(stdout.includes('passed SLA threshold'));

    // JSON flag
    const resJson = await runCliCmd(['eval', tmpFile, '--json']);
    assert.strictEqual(resJson.code, 0);
    const parsed = JSON.parse(resJson.stdout);
    assert.ok(parsed.overallScore >= 70);
    assert.ok(parsed.dimensions.safety >= 70);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('CLI: export-test generates deterministic reproduction test script', async () => {
  const tmpSession = path.join(os.tmpdir(), `agentwire_test_session_${Date.now()}.json`);
  const tmpTestOut = path.join(os.tmpdir(), `agentwire_out_${Date.now()}.test.js`);

  const session = {
    version: '1.0.0',
    sessionId: 'repro_session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalTokens: 100,
    events: [
      {
        id: 'ev_1',
        stepIndex: 0,
        timestamp: Date.now(),
        kind: 'tool_call',
        source: 'agent',
        summary: 'Call tool: run_calc',
        payload: { tool: 'run_calc', arguments: { val: 42 } },
        metrics: { totalEstimatedTokens: 20, promptTokens: 0, completionTokens: 0, toolCallTokens: 20, toolResultTokens: 0 }
      }
    ],
    branches: [],
    breakpoints: []
  };

  fs.writeFileSync(tmpSession, JSON.stringify(session, null, 2), 'utf-8');

  try {
    const { code, stdout } = await runCliCmd(['export-test', tmpSession, '-o', tmpTestOut]);
    assert.strictEqual(code, 0);
    assert.ok(stdout.includes('Generated deterministic reproduction test'));
    assert.ok(fs.existsSync(tmpTestOut));

    const content = fs.readFileSync(tmpTestOut, 'utf-8');
    assert.ok(content.includes('run_calc'));
    assert.ok(content.includes('42'));
  } finally {
    if (fs.existsSync(tmpSession)) fs.unlinkSync(tmpSession);
    if (fs.existsSync(tmpTestOut)) fs.unlinkSync(tmpTestOut);
  }
});
