import { test } from 'node:test';
import assert from 'node:assert';
import { calculateSessionCost, formatUsd, KNOWN_MODELS } from '../dist/utils/cost.js';
import { SecurityAuditor } from '../dist/core/security.js';

test('Cost: calculates pricing accurately across models', () => {
  // Test Claude 3.5 Sonnet: input $3/1M, output $15/1M
  const sonnetCost = calculateSessionCost({ promptTokens: 1_000_000, completionTokens: 1_000_000, totalEstimatedTokens: 2_000_000 }, 'claude-3.5-sonnet');
  assert.strictEqual(sonnetCost.estimatedCostUsd, 18.0);
  assert.strictEqual(sonnetCost.contextWindow, 200000);

  // Test GPT-4o: input $2.5/1M, output $10/1M
  const gptCost = calculateSessionCost({ promptTokens: 500_000, completionTokens: 200_000, totalEstimatedTokens: 700_000 }, 'gpt-4o');
  // (0.5 * 2.5) + (0.2 * 10) = 1.25 + 2.0 = 3.25
  assert.strictEqual(gptCost.estimatedCostUsd, 3.25);
  assert.strictEqual(gptCost.contextWindow, 128000);

  // Fallback to default model if unknown
  const unknownCost = calculateSessionCost({ promptTokens: 100_000, completionTokens: 50_000, totalEstimatedTokens: 150_000 }, 'some-future-model');
  assert.ok(unknownCost.estimatedCostUsd > 0);
  assert.strictEqual(unknownCost.modelName, 'Standard LLM Benchmark');
});

test('Cost: computes context window percentage and formatting', () => {
  const result = calculateSessionCost({ promptTokens: 100_000, completionTokens: 20_000, totalEstimatedTokens: 120_000 }, 'claude-3.5-sonnet');
  // 120,000 / 200,000 = 60%
  assert.strictEqual(result.contextUsedPct, 60);
  assert.strictEqual(formatUsd(0.0042), '$0.004');
  assert.strictEqual(formatUsd(12.50), '$12.50');
});

test('SecurityAuditor: detects secret leaks (API keys, tokens)', () => {
  const leakedKeys = [
    'sk-proj-abc1234567890abcdef1234567890abcdef1234567890',
    'sk-ant-api03-abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    'ghp_1234567890abcdefghijklmnopqrstuvwxyzAB',
    'AKIAIOSFODNN7EXAMPLE'
  ];

  for (const key of leakedKeys) {
    const findings = SecurityAuditor.audit({ apiKey: key });
    assert.ok(findings.length > 0, `Expected secret finding for ${key}`);
    assert.strictEqual(findings[0].category, 'secret_leak');
  }
});

test('SecurityAuditor: detects directory and path traversal sequences', () => {
  const traversalPayloads = [
    { path: '../../../../etc/passwd' },
    { target: '..\\..\\windows\\system32\\cmd.exe' },
    { uri: '/var/log/../../root/.ssh/id_rsa' }
  ];

  for (const payload of traversalPayloads) {
    const findings = SecurityAuditor.audit(payload);
    assert.ok(findings.length > 0, `Expected traversal finding for ${JSON.stringify(payload)}`);
    assert.strictEqual(findings[0].category, 'path_traversal');
  }
});

test('SecurityAuditor: detects destructive shell & database commands', () => {
  const destructiveCases = [
    { cmd: 'rm -rf / --no-preserve-root' },
    { query: 'DROP DATABASE production;' },
    { exec: 'mkfs.ext4 /dev/sda1' },
    { wipe: 'DROP TABLE users;' }
  ];

  for (const payload of destructiveCases) {
    const findings = SecurityAuditor.audit(payload);
    assert.ok(findings.length > 0, `Expected destructive finding for ${JSON.stringify(payload)}`);
    assert.strictEqual(findings[0].category, 'destructive_command');
  }
});

test('SecurityAuditor: zero false positives on normal safe operations', () => {
  const safeCases = [
    { path: 'src/core/session.ts' },
    { query: 'SELECT id, name FROM users WHERE id = 1;' },
    { code: 'console.log("Hello world");' },
    { options: { recursive: true, pattern: '*.test.js' } }
  ];

  for (const payload of safeCases) {
    const findings = SecurityAuditor.audit(payload);
    assert.strictEqual(findings.length, 0);
  }
});
