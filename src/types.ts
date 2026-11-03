/**
 * agentwire - Type Definitions
 * The Wireshark & Live Time-Travel Debugger for AI Agents & MCP Workflows
 */

import { SecurityFinding } from './core/security.js';
import { LoopAlert } from './core/loop-detector.js';
import { MockRule } from './core/mock-engine.js';
import { CostEvaluation } from './utils/cost.js';

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
  securityFindings?: SecurityFinding[];
  loopAlert?: LoopAlert;
  isMocked?: boolean;
}

export interface BreakpointRule {
  id: string;
  enabled: boolean;
  type:
    | 'tool_name'
    | 'tool_arg_regex'
    | 'token_threshold'
    | 'context_budget_pct'
    | 'error_status'
    | 'secret_leak'
    | 'path_traversal'
    | 'infinite_loop'
    | 'custom_filter';
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
  mocks?: MockRule[];
  costEvaluation?: CostEvaluation;
}

export interface AgentwireOptions {
  port?: number;
  webUi?: boolean;
  quiet?: boolean;
  exportPath?: string;
  inspectFile?: string;
  breakpoints?: BreakpointRule[];
  mocks?: MockRule[];
  stepMode?: boolean;
  modelKey?: string;
}
