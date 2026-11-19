/**
 * agentwire - Chaos & Fault Simulation Engine
 * Injects synthetic latency, rate-limiting (429), server faults, and payload mutations
 * into MCP tool calls and API endpoints to verify AI agent resiliency.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { ChaosRule } from '../types.js';

export interface ChaosEvaluationResult {
  shouldIntercept: boolean;
  action?: ChaosRule['action'];
  delayMs?: number;
  errorResponse?: any;
  hitRule?: ChaosRule;
}

export class ChaosEngine extends EventEmitter {
  private rules: Map<string, ChaosRule> = new Map();
  private callCounts: Map<string, number> = new Map();

  constructor(initialRules: ChaosRule[] = []) {
    super();
    for (const rule of initialRules) {
      this.addRule(rule);
    }
  }

  public addRule(rule: ChaosRule): void {
    const id = rule.id || `chaos_${randomUUID().slice(0, 6)}`;
    this.rules.set(id, { ...rule, id });
  }

  public removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  public toggleRule(id: string, enabled?: boolean): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;
    rule.enabled = enabled !== undefined ? enabled : !rule.enabled;
    return true;
  }

  public getRules(): ChaosRule[] {
    return Array.from(this.rules.values());
  }

  public clear(): void {
    this.rules.clear();
    this.callCounts.clear();
  }

  /**
   * Evaluates an incoming tool call against registered chaos rules.
   * If a rule matches and fires, applies artificial delay or returns simulated errors.
   */
  public async evaluate(toolName: string, args: any): Promise<ChaosEvaluationResult> {
    const argsStr = JSON.stringify(args || {});

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      // 1. Tool name match
      if (rule.toolName && rule.toolName !== '*' && rule.toolName.toLowerCase() !== toolName.toLowerCase()) {
        continue;
      }

      // 2. Argument regex pattern match
      if (rule.pattern) {
        try {
          const reg = new RegExp(rule.pattern, 'i');
          if (!reg.test(argsStr)) continue;
        } catch {
          continue;
        }
      }

      // 3. Probability check
      const prob = rule.probability !== undefined ? rule.probability : 1.0;
      if (prob < 1.0 && Math.random() > prob) {
        continue;
      }

      // 4. Fail count check (e.g. fail first N times then pass)
      const countKey = `${rule.id}:${toolName}`;
      const count = (this.callCounts.get(countKey) || 0) + 1;
      this.callCounts.set(countKey, count);

      if (rule.failCount !== undefined && count > rule.failCount) {
        // Exceeded fail count, let subsequent requests through
        continue;
      }

      // Rule fired!
      // Action: delay
      if (rule.action === 'delay') {
        const delayMs = rule.delayMs || 1000;
        this.emit('delay_injected', { rule, toolName, delayMs });
        await new Promise((r) => setTimeout(r, delayMs));
        return {
          shouldIntercept: false, // After delay, let actual tool run
          action: 'delay',
          delayMs,
          hitRule: rule
        };
      }

      // Action: rate_limit (HTTP 429 / MCP Rate limit error)
      if (rule.action === 'rate_limit') {
        const errorMsg = rule.errorMessage || '429 Too Many Requests: Rate limit quota exceeded. Please retry after delay.';
        const errorResponse = {
          isError: true,
          content: [
            {
              type: 'text',
              text: errorMsg
            }
          ],
          code: 429
        };
        this.emit('fault_injected', { rule, toolName, action: 'rate_limit', errorResponse });
        return {
          shouldIntercept: true,
          action: 'rate_limit',
          errorResponse,
          hitRule: rule
        };
      }

      // Action: error (simulated server / tool failure)
      if (rule.action === 'error') {
        const errorMsg = rule.errorMessage || `Tool execution failed: simulated error for '${toolName}'`;
        const errorResponse = {
          isError: true,
          content: [
            {
              type: 'text',
              text: errorMsg
            }
          ],
          code: rule.errorStatusCode || 500
        };
        this.emit('fault_injected', { rule, toolName, action: 'error', errorResponse });
        return {
          shouldIntercept: true,
          action: 'error',
          errorResponse,
          hitRule: rule
        };
      }

      // Action: truncate (payload truncated)
      if (rule.action === 'truncate') {
        const truncatedResponse = {
          content: [
            {
              type: 'text',
              text: '[WARNING: Payload truncated by context budget threshold...]'
            }
          ]
        };
        this.emit('fault_injected', { rule, toolName, action: 'truncate', errorResponse: truncatedResponse });
        return {
          shouldIntercept: true,
          action: 'truncate',
          errorResponse: truncatedResponse,
          hitRule: rule
        };
      }
    }

    return { shouldIntercept: false };
  }
}
