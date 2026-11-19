/**
 * agentwire - Advanced Loop & Oscillation Detector
 * Identifies repetitive tool calls, cyclical agent hallucinations, error thrashing, and infinite loops
 */

import { createHash } from 'node:crypto';
import { WireEvent } from '../types.js';

export interface LoopAlert {
  type: 'identical_repeat' | 'cyclical_oscillation' | 'error_thrashing';
  toolName: string;
  repeatCount: number;
  message: string;
  cycleSequence?: string[];
  cyclePeriod?: number;
}

export class LoopDetector {
  private history: Array<{ hash: string; toolName: string; argsStr: string; isError?: boolean }> = [];
  private maxHistory: number;
  private repeatThreshold: number;
  private consecutiveErrors = 0;

  constructor(repeatThreshold = 3, maxHistory = 30) {
    this.repeatThreshold = repeatThreshold;
    this.maxHistory = maxHistory;
  }

  /**
   * Evaluates an incoming tool call event and returns an alert if an infinite loop or cycle is detected
   */
  public evaluate(event: WireEvent): LoopAlert | null {
    if (event.kind !== 'tool_call') {
      if (event.kind === 'error') {
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= 3) {
          return {
            type: 'error_thrashing',
            toolName: 'system_error',
            repeatCount: this.consecutiveErrors,
            message: `Agent is error thrashing: ${this.consecutiveErrors} consecutive errors occurred`
          };
        }
      } else if (event.kind === 'tool_result' && (event.payload?.isError || event.payload?.error)) {
        this.consecutiveErrors++;
        if (this.consecutiveErrors >= 3) {
          return {
            type: 'error_thrashing',
            toolName: event.summary || 'tool_error',
            repeatCount: this.consecutiveErrors,
            message: `Agent is in error thrashing loop: 3 consecutive tool results failed`
          };
        }
      } else if (event.kind === 'tool_result' && !event.payload?.isError && !event.payload?.error) {
        this.consecutiveErrors = 0;
      }
      return null;
    }

    const toolName = event.payload?.tool || event.payload?.name || 'unknown';
    const args = event.payload?.arguments || event.payload?.args || {};
    const argsStr = JSON.stringify(args);
    const hash = createHash('sha256').update(`${toolName}:${argsStr}`).digest('hex').slice(0, 12);

    this.history.push({ hash, toolName, argsStr });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Check 1: Identical consecutive tool calls (period 1)
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
        cyclePeriod: 1,
        message: `Agent is in a loop: called '${toolName}' with identical arguments ${consecutiveCount} consecutive times`
      };
    }

    // Check 2: Multi-Period cyclical oscillations (period 2, 3, 4)
    const len = this.history.length;
    const h = this.history;

    // Check period 2: (A -> B -> A -> B -> A -> B)
    if (len >= 6) {
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
          cyclePeriod: 2,
          cycleSequence: [h[len - 2].toolName, h[len - 1].toolName],
          message: `Agent is oscillating between tools: [${h[len - 2].toolName} ⇄ ${h[len - 1].toolName}] repeatedly`
        };
      }
    }

    // Check period 3: (A -> B -> C -> A -> B -> C)
    if (len >= 6) {
      const p = 3;
      if (
        h[len - 1].hash === h[len - 1 - p].hash &&
        h[len - 2].hash === h[len - 2 - p].hash &&
        h[len - 3].hash === h[len - 3 - p].hash &&
        (h[len - 1].hash !== h[len - 2].hash || h[len - 2].hash !== h[len - 3].hash)
      ) {
        const seq = [h[len - 3].toolName, h[len - 2].toolName, h[len - 1].toolName];
        return {
          type: 'cyclical_oscillation',
          toolName,
          repeatCount: 2,
          cyclePeriod: 3,
          cycleSequence: seq,
          message: `Agent is oscillating in a 3-step cycle: [${seq.join(' ➔ ')}]`
        };
      }
    }

    // Check period 4: (A -> B -> C -> D -> A -> B -> C -> D)
    if (len >= 8) {
      const p = 4;
      if (
        h[len - 1].hash === h[len - 1 - p].hash &&
        h[len - 2].hash === h[len - 2 - p].hash &&
        h[len - 3].hash === h[len - 3 - p].hash &&
        h[len - 4].hash === h[len - 4 - p].hash
      ) {
        const seq = [h[len - 4].toolName, h[len - 3].toolName, h[len - 2].toolName, h[len - 1].toolName];
        return {
          type: 'cyclical_oscillation',
          toolName,
          repeatCount: 2,
          cyclePeriod: 4,
          cycleSequence: seq,
          message: `Agent is oscillating in a 4-step cycle: [${seq.join(' ➔ ')}]`
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
    this.consecutiveErrors = 0;
  }
}
