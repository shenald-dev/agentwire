/**
 * agentwire - WireSession Engine
 * Manages event trajectories, token waterfalls, and time-travel state branching
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  WireEvent,
  EventKind,
  SerializedSession,
  TimeTravelBranch,
  BreakpointRule
} from '../types.js';
import { computeEventMetrics } from '../utils/tokens.js';
import { calculateSessionCost, CostEvaluation } from '../utils/cost.js';
import { SecurityAuditor } from './security.js';
import { LoopDetector } from './loop-detector.js';
import { MockRule } from './mock-engine.js';

export interface SessionEvents {
  event: (event: WireEvent) => void;
  paused: (event: WireEvent) => void;
  resumed: (event: WireEvent) => void;
  branch: (branch: TimeTravelBranch) => void;
}

export class WireSession extends EventEmitter {
  public readonly id: string;
  public readonly createdAt: number;
  public updatedAt: number;
  public agentName: string;
  private events: WireEvent[] = [];
  private branches: TimeTravelBranch[] = [];
  private totalTokens = 0;
  private breakpoints: BreakpointRule[] = [];
  private mocks: MockRule[] = [];
  private loopDetector: LoopDetector = new LoopDetector();
  public modelKey = 'default';

  constructor(agentName = 'Agent Session', id?: string) {
    super();
    this.id = id || `wire_${randomUUID().slice(0, 8)}`;
    this.agentName = agentName;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  /**
   * Records a new wire event into the active trajectory with automated security & loop analysis
   */
  public recordEvent(
    kind: EventKind,
    source: WireEvent['source'],
    summary: string,
    payload: any,
    metadata?: Record<string, any>
  ): WireEvent {
    const stepIndex = this.events.length;
    const metrics = computeEventMetrics(kind, payload, this.totalTokens);
    this.totalTokens += metrics.totalEstimatedTokens;
    this.updatedAt = Date.now();

    // Security Audit
    const securityFindings = SecurityAuditor.audit(payload);

    const event: WireEvent = {
      id: `ev_${stepIndex}_${randomUUID().slice(0, 6)}`,
      stepIndex,
      timestamp: this.updatedAt,
      kind,
      source,
      summary,
      payload,
      metrics,
      metadata,
      securityFindings: securityFindings.length > 0 ? securityFindings : undefined
    };

    // Loop Detection for tool calls
    if (kind === 'tool_call') {
      const loopAlert = this.loopDetector.evaluate(event);
      if (loopAlert) {
        event.loopAlert = loopAlert;
      }
    }

    this.events.push(event);
    this.emit('event', event);
    return event;
  }

  /**
   * Returns all recorded events in sequential order
   */
  public getEvents(): WireEvent[] {
    return [...this.events];
  }

  /**
   * Retrieves an event by its step index
   */
  public getEvent(index: number): WireEvent | undefined {
    return this.events[index];
  }

  /**
   * Total estimated tokens consumed across all recorded events
   */
  public getTotalTokens(): number {
    return this.totalTokens;
  }

  /**
   * Computes real-time financial and context window analytics
   */
  public getCostEvaluation(): CostEvaluation {
    return calculateSessionCost({ totalEstimatedTokens: this.totalTokens }, this.modelKey);
  }

  /**
   * Time-Travel: Rewinds to stepIndex, creates an isolated branch,
   * allowing the agent/user to replay or alter history from that point.
   */
  public branchFromStep(stepIndex: number, description = 'Time-travel branch'): TimeTravelBranch {
    if (stepIndex < 0 || stepIndex >= this.events.length) {
      throw new Error(`Cannot branch from invalid step index: ${stepIndex}`);
    }

    const branch: TimeTravelBranch = {
      branchId: `branch_${randomUUID().slice(0, 6)}`,
      parentStepIndex: stepIndex,
      createdAt: Date.now(),
      description
    };

    this.branches.push(branch);
    // Truncate active trajectory to stepIndex + 1 to fork from that state
    this.events = this.events.slice(0, stepIndex + 1);

    // Recalculate total tokens
    this.totalTokens = this.events.reduce(
      (acc, ev) => acc + (ev.metrics?.totalEstimatedTokens || 0),
      0
    );

    this.loopDetector.reset();
    this.emit('branch', branch);
    return branch;
  }

  /**
   * Get all registered time-travel branches
   */
  public getBranches(): TimeTravelBranch[] {
    return [...this.branches];
  }

  /**
   * Set active breakpoints for this session
   */
  public setBreakpoints(rules: BreakpointRule[]): void {
    this.breakpoints = [...rules];
  }

  public getBreakpoints(): BreakpointRule[] {
    return [...this.breakpoints];
  }

  /**
   * Set active mock rules
   */
  public setMocks(mocks: MockRule[]): void {
    this.mocks = [...mocks];
  }

  public getMocks(): MockRule[] {
    return [...this.mocks];
  }

  /**
   * Serializes the complete session into a portable JSON structure
   */
  public exportJson(): SerializedSession {
    return {
      version: '1.0.0',
      sessionId: this.id,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      agentName: this.agentName,
      totalTokens: this.totalTokens,
      events: this.events,
      branches: this.branches,
      breakpoints: this.breakpoints,
      mocks: this.mocks,
      costEvaluation: this.getCostEvaluation()
    };
  }

  /**
   * Rehydrates a session from serialized JSON
   */
  public static importJson(data: SerializedSession): WireSession {
    const session = new WireSession(data.agentName, data.sessionId);
    (session as any).createdAt = data.createdAt;
    session.updatedAt = data.updatedAt;
    session.totalTokens = data.totalTokens;
    session.events = [...data.events];
    session.branches = [...(data.branches || [])];
    session.breakpoints = [...(data.breakpoints || [])];
    session.mocks = [...(data.mocks || [])];
    return session;
  }
}
