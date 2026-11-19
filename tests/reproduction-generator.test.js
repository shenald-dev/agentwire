import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TestGenerator } from '../dist/generators/reproduction-generator.js';

test('TestGenerator: generates valid node:test and jest reproduction scripts', () => {
  const dummySession = {
    version: '1.0.0',
    sessionId: 'session_test_123',
    agentName: 'Replay Test Agent',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalTokens: 1200,
    events: [
      {
        id: 'ev_0',
        stepIndex: 0,
        timestamp: Date.now(),
        kind: 'tool_call',
        source: 'agent',
        summary: 'Call tool: get_weather',
        payload: { tool: 'get_weather', arguments: { city: 'Tokyo' } },
        metrics: { totalEstimatedTokens: 25, promptTokens: 0, completionTokens: 0, toolCallTokens: 25, toolResultTokens: 0 }
      },
      {
        id: 'ev_1',
        stepIndex: 1,
        timestamp: Date.now(),
        kind: 'tool_result',
        source: 'tool',
        summary: 'Result: get_weather',
        payload: { content: [{ type: 'text', text: 'Sunny, 22C' }] },
        metrics: { totalEstimatedTokens: 30, promptTokens: 0, completionTokens: 0, toolCallTokens: 0, toolResultTokens: 30 }
      }
    ],
    branches: [],
    breakpoints: []
  };

  // Node test generation
  const nodeTestScript = TestGenerator.generate(dummySession, { runner: 'node-test' });
  assert.ok(nodeTestScript.includes("import { test } from 'node:test';"));
  assert.ok(nodeTestScript.includes('get_weather'));
  assert.ok(nodeTestScript.includes('Tokyo'));
  assert.ok(nodeTestScript.includes('mockCallTool'));

  // Jest generation
  const jestTestScript = TestGenerator.generate(dummySession, { runner: 'jest' });
  assert.ok(jestTestScript.includes('describe('));
  assert.ok(jestTestScript.includes('jest.fn('));
  assert.ok(jestTestScript.includes('get_weather'));
});
