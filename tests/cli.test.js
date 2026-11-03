import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
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

test('CLI: --help renders command manual and options', async () => {
  const { code, stdout } = await runCliCmd(['--help']);
  assert.strictEqual(code, 0);
  assert.ok(stdout.includes('agentwire'));
  assert.ok(stdout.includes('mcp'));
  assert.ok(stdout.includes('inspect'));
  assert.ok(stdout.includes('ui'));
});

test('CLI: --version displays current semver', async () => {
  const { code, stdout } = await runCliCmd(['--version']);
  assert.strictEqual(code, 0);
  assert.ok(stdout.includes('0.1.0'));
});
