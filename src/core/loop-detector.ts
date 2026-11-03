/**
 * agentwire - Loop & Oscillation Detector
 * Identifies repetitive tool calls, cyclical agent hallucinations, and infinite loops
 */

import { createHash } from 'node:crypto';
import { WireEvent } from '../types.js';

export interface LoopAlert {
  type: 'identical_repeat' | 'cyclical_oscillation';
  toolName: string;
  repeatCount: number;
  message: string;
  cycleSequence?: string[];
}

export class LoopDetector {
  private history: Array<{ hash: string; toolName: string; argsStr: string }> = [];
  private maxHistory: number;
  private repeatThreshold: number;

  constructor(repeatThreshold = 3, maxHistory = 20) {
    this.repeatThreshold = repeatThreshold;
    this.maxHistory = maxHistory;
  }

  /**
   * Evaluates an incoming tool call event and returns an alert if an infinite loop or cycle is detected
   */
  public evaluate(event: WireEvent): LoopAlert | null {
    if (event.kind !== 'tool_call') return null;

    const toolName = event.payload?.tool || event.payload?.name || 'unknown';
    const args = event.payload?.arguments || event.payload?.args || {};
    const argsStr = JSON.stringify(args);
    const hash = createHash('sha256').update(`${toolName}:${argsStr}`).digest('hex').slice(0, 12);

    this.history.push({ hash, toolName, argsStr });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Check 1: Identical consecutive tool calls
    let consecutiveCount = 0;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].hash === hash) {
        consecutiveCount++;
      } else {
        break;
      }
    }

    if (consecutiveCount >= this.repeatThreshold) {
      return {
        type: 'identical_repeat',
        toolName,
        repeatCount: consecutiveCount,
        message: `Agent is in a loop: called '${toolName}' with identical arguments ${consecutiveCount} consecutive times`
      };
    }

    // Check 2: Cyclical oscillation (e.g. A -> B -> A -> B -> A -> B)
    if (this.history.length >= 6) {
      const len = this.history.length;
      const h = this.history;
      // Pattern period 2: h[len-1] === h[len-3] === h[len-5] AND h[len-2] === h[len-4] === h[len-6]
      if (
        h[len - 1].hash === h[len - 3].hash &&
        h[len - 3].hash === h[len - 5].hash &&
        h[len - 2].hash === h[len - 4].hash &&
        h[len - 4].hash === h[len - 6].hash &&
        h[len - 1].hash !== h[len - 2].hash
      ) {
        return {
          type: 'cyclical_oscillation',
          toolName,
          repeatCount: 3,
          cycleSequence: [h[len - 2].toolName, h[len - 1].toolName],
          message: `Agent is oscillating between tools: [${h[len - 2].toolName} ⇄ ${h[len - 1].toolName}] repeatedly`
        };
      }
    }

    return null;
  }

  /**
   * Clears tracking history (e.g. after user resumes or branches)
   */
  public reset(): void {
    this.history = [];
  }
}
