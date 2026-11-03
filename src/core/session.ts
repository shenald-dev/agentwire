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

  constructor(agentName = 'Agent Session', id?: string) {
    super();
    this.id = id || `wire_${randomUUID().slice(0, 8)}`;
    this.agentName = agentName;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  /**
   * Records a new wire event into the active trajectory
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

    const event: WireEvent = {
      id: `ev_${stepIndex}_${randomUUID().slice(0, 6)}`,
      stepIndex,
      timestamp: this.updatedAt,
      kind,
      source,
      summary,
      payload,
      metrics,
      metadata
    };

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
      breakpoints: this.breakpoints
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
    return session;
  }
}
