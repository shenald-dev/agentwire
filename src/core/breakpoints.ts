/**
 * agentwire - Breakpoints Engine
 * Evaluates execution rules, pauses agent trajectories, and allows payload mutation
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { BreakpointRule, BreakpointHit, WireEvent } from '../types.js';

export interface PendingPause {
  hitId: string;
  rule: BreakpointRule;
  event: WireEvent;
  resolve: (action: { action: 'continue' | 'modify' | 'abort'; payload?: any }) => void;
  createdAt: number;
}

export class BreakpointEngine extends EventEmitter {
  private rules: Map<string, BreakpointRule> = new Map();
  private pendingPauses: Map<string, PendingPause> = new Map();

  constructor(initialRules: BreakpointRule[] = []) {
    super();
    for (const rule of initialRules) {
      this.addRule(rule);
    }
  }

  /**
   * Registers a new breakpoint rule
   */
  public addRule(rule: BreakpointRule): void {
    const id = rule.id || `bp_${randomUUID().slice(0, 6)}`;
    this.rules.set(id, { ...rule, id });
  }

  /**
   * Removes a rule by its ID
   */
  public removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  /**
   * Toggles a rule enabled/disabled
   */
  public toggleRule(id: string, enabled?: boolean): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;
    rule.enabled = enabled !== undefined ? enabled : !rule.enabled;
    return true;
  }

  /**
   * Returns all active breakpoint rules
   */
  public getRules(): BreakpointRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Evaluates an incoming event against all enabled rules.
   * If a rule matches and action is 'pause', returns a Promise that pauses execution.
   */
  public async evaluate(event: WireEvent): Promise<{
    shouldPause: boolean;
    modifiedPayload?: any;
    aborted?: boolean;
    hitRule?: BreakpointRule;
  }> {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      let matched = false;

      switch (rule.type) {
        case 'tool_name': {
          // Check if event is a tool call and matches the pattern
          const toolName = event.payload?.name || event.payload?.tool;
          if (toolName && toolName.toLowerCase() === rule.pattern.toLowerCase()) {
            matched = true;
          }
          break;
        }

        case 'tool_arg_regex': {
          // Check if any argument matches the regex
          const argsStr = JSON.stringify(event.payload?.args || event.payload?.arguments || event.payload || {});
          try {
            const regex = new RegExp(rule.pattern, 'i');
            if (regex.test(argsStr)) {
              matched = true;
            }
          } catch {
            // Invalid regex ignored
          }
          break;
        }

        case 'token_threshold': {
          const threshold = parseInt(rule.pattern, 10);
          if (!isNaN(threshold) && event.metrics.totalEstimatedTokens >= threshold) {
            matched = true;
          }
          break;
        }
      }

      if (matched) {
        if (rule.action === 'block') {
          return { shouldPause: false, aborted: true, hitRule: rule };
        }

        if (rule.action === 'alert') {
          this.emit('alert', { rule, event });
          continue;
        }

        if (rule.action === 'pause') {
          const hitId = `hit_${randomUUID().slice(0, 6)}`;
          event.paused = true;

          const hit: BreakpointHit = {
            breakpointId: rule.id,
            event,
            matchedPattern: rule.pattern,
            pausedAt: Date.now()
          };

          this.emit('hit', hit);

          // Return a promise that holds execution until resume() is called
          const outcome = await new Promise<{ action: 'continue' | 'modify' | 'abort'; payload?: any }>(
            (resolve) => {
              this.pendingPauses.set(hitId, {
                hitId,
                rule,
                event,
                resolve,
                createdAt: Date.now()
              });
            }
          );

          event.paused = false;

          if (outcome.action === 'abort') {
            return { shouldPause: true, aborted: true, hitRule: rule };
          }

          if (outcome.action === 'modify') {
            return {
              shouldPause: true,
              modifiedPayload: outcome.payload,
              hitRule: rule
            };
          }

          return { shouldPause: true, hitRule: rule };
        }
      }
    }

    return { shouldPause: false };
  }

  /**
   * Resumes a paused execution
   */
  public resume(
    hitId: string,
    action: 'continue' | 'modify' | 'abort' = 'continue',
    modifiedPayload?: any
  ): boolean {
    const pending = this.pendingPauses.get(hitId);
    if (!pending) return false;

    this.pendingPauses.delete(hitId);
    pending.resolve({ action, payload: modifiedPayload });
    this.emit('resumed', { hitId, action, modifiedPayload });
    return true;
  }

  /**
   * Resumes the first pending pause (useful for simple CLI controllers)
   */
  public resumeNext(
    action: 'continue' | 'modify' | 'abort' = 'continue',
    modifiedPayload?: any
  ): boolean {
    const firstKey = this.pendingPauses.keys().next().value;
    if (!firstKey) return false;
    return this.resume(firstKey, action, modifiedPayload);
  }

  /**
   * Returns currently pending pauses
   */
  public getPendingPauses(): PendingPause[] {
    return Array.from(this.pendingPauses.values());
  }
}
