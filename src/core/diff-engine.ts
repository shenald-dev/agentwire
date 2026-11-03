/**
 * agentwire - Trajectory Diff Engine
 * Compares two agent sessions side-by-side to pinpoint divergence points, token drift, and error emergence
 */

import { SerializedSession, WireEvent } from '../types.js';

export interface DiffResult {
  sessionA: { id: string; agentName?: string; totalTokens: number; eventCount: number };
  sessionB: { id: string; agentName?: string; totalTokens: number; eventCount: number };
  tokensDiff: number;
  tokensPctChange: number;
  divergenceStepIndex: number | null;
  divergenceReason?: string;
  divergingEventA?: WireEvent;
  divergingEventB?: WireEvent;
  identicalPrefixSteps: number;
  errorsA: number;
  errorsB: number;
}

export class TrajectoryDiff {
  public static compare(sessionA: SerializedSession, sessionB: SerializedSession): DiffResult {
    const eventsA = sessionA.events || [];
    const eventsB = sessionB.events || [];

    const minLen = Math.min(eventsA.length, eventsB.length);
    let divergenceStepIndex: number | null = null;
    let divergenceReason: string | undefined;
    let divergingEventA: WireEvent | undefined;
    let divergingEventB: WireEvent | undefined;

    let identicalPrefixSteps = 0;

    for (let i = 0; i < minLen; i++) {
      const ea = eventsA[i];
      const eb = eventsB[i];

      // Compare kind and tool name or summary
      const toolA = ea.payload?.tool || ea.payload?.name;
      const toolB = eb.payload?.tool || eb.payload?.name;

      const argsA = JSON.stringify(ea.payload?.arguments || ea.payload?.args || {});
      const argsB = JSON.stringify(eb.payload?.arguments || eb.payload?.args || {});

      if (ea.kind !== eb.kind || toolA !== toolB || argsA !== argsB) {
        divergenceStepIndex = i;
        divergingEventA = ea;
        divergingEventB = eb;

        if (ea.kind !== eb.kind) {
          divergenceReason = `Kind mismatch at step #${i}: Session A executed '${ea.kind}', Session B executed '${eb.kind}'`;
        } else if (toolA !== toolB) {
          divergenceReason = `Tool choice diverged at step #${i}: Session A called '${toolA}', Session B called '${toolB}'`;
        } else {
          divergenceReason = `Tool arguments diverged at step #${i} for tool '${toolA}'`;
        }
        break;
      }

      identicalPrefixSteps++;
    }

    if (divergenceStepIndex === null && eventsA.length !== eventsB.length) {
      divergenceStepIndex = minLen;
      divergenceReason = `Session length diverged after step #${minLen - 1}: Session A has ${eventsA.length} steps, Session B has ${eventsB.length} steps`;
      divergingEventA = eventsA[minLen];
      divergingEventB = eventsB[minLen];
    }

    const tokensDiff = sessionB.totalTokens - sessionA.totalTokens;
    const tokensPctChange = sessionA.totalTokens > 0
      ? Number(((tokensDiff / sessionA.totalTokens) * 100).toFixed(1))
      : 0;

    const countErrors = (events: WireEvent[]) => events.filter((e) => e.kind === 'error').length;

    return {
      sessionA: {
        id: sessionA.sessionId,
        agentName: sessionA.agentName,
        totalTokens: sessionA.totalTokens,
        eventCount: eventsA.length
      },
      sessionB: {
        id: sessionB.sessionId,
        agentName: sessionB.agentName,
        totalTokens: sessionB.totalTokens,
        eventCount: eventsB.length
      },
      tokensDiff,
      tokensPctChange,
      divergenceStepIndex,
      divergenceReason,
      divergingEventA,
      divergingEventB,
      identicalPrefixSteps,
      errorsA: countErrors(eventsA),
      errorsB: countErrors(eventsB)
    };
  }
}
