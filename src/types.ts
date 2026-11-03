/**
 * agentwire - Type Definitions
 * The Wireshark & Live Time-Travel Debugger for AI Agents & MCP Workflows
 */

export type EventKind =
  | 'session_start'
  | 'session_end'
  | 'prompt_turn'
  | 'tool_call'
  | 'tool_result'
  | 'breakpoint_hit'
  | 'breakpoint_resume'
  | 'error';

export interface WireTokenMetrics {
  totalEstimatedTokens: number;
  promptTokens: number;
  completionTokens: number;
  toolCallTokens: number;
  toolResultTokens: number;
  turnPercentage?: number;
}

export interface WireEvent {
  id: string;
  stepIndex: number;
  timestamp: number;
  kind: EventKind;
  source: 'agent' | 'user' | 'tool' | 'system' | 'proxy';
  summary: string;
  payload: any;
  metrics: WireTokenMetrics;
  paused?: boolean;
  durationMs?: number;
  metadata?: Record<string, any>;
}

export interface BreakpointRule {
  id: string;
  enabled: boolean;
  type: 'tool_name' | 'tool_arg_regex' | 'token_threshold' | 'custom_filter';
  pattern: string; // e.g. "bash", "execute_command", "rm -rf", or number string
  action: 'pause' | 'alert' | 'block';
  description?: string;
}

export interface BreakpointHit {
  breakpointId: string;
  event: WireEvent;
  matchedPattern: string;
  pausedAt: number;
  resumeCallback?: (action: 'continue' | 'modify' | 'abort', modifiedPayload?: any) => void;
}

export interface TimeTravelBranch {
  branchId: string;
  parentStepIndex: number;
  createdAt: number;
  description: string;
}

export interface SerializedSession {
  version: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  agentName?: string;
  totalTokens: number;
  events: WireEvent[];
  branches: TimeTravelBranch[];
  breakpoints: BreakpointRule[];
}

export interface AgentwireOptions {
  port?: number;
  webUi?: boolean;
  quiet?: boolean;
  exportPath?: string;
  inspectFile?: string;
  breakpoints?: BreakpointRule[];
}
