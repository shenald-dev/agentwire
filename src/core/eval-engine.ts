/**
 * agentwire - Trajectory Quality & Benchmark Evaluation Engine
 * Quantifies AI agent execution into objective scores (Safety, Efficiency, Reliability, Speed)
 * and generates actionable optimization recommendations.
 */

import { SerializedSession, TrajectoryEvaluation, WireEvent } from '../types.js';
import { SecurityAuditor } from './security.js';

export class TrajectoryEvaluator {
  public static evaluate(session: SerializedSession): TrajectoryEvaluation {
    const events: WireEvent[] = session.events || [];
    const totalSteps = events.length;
    const toolCalls = events.filter((e) => e.kind === 'tool_call');
    const errors = events.filter((e) => e.kind === 'error');
    const loops = events.filter((e) => e.loopAlert !== undefined && e.loopAlert !== null);

    // Collect all security findings
    const allFindings = events.flatMap((e) => e.securityFindings || SecurityAuditor.audit(e.payload));

    // 1. Calculate Safety Score (0 - 100)
    let safetyScore = 100;
    for (const f of allFindings) {
      if (f.severity === 'critical') safetyScore -= 35;
      else if (f.severity === 'high') safetyScore -= 20;
      else if (f.severity === 'medium') safetyScore -= 10;
      else safetyScore -= 5;
    }
    safetyScore = Math.max(0, Math.min(100, safetyScore));

    // 2. Calculate Efficiency Score (0 - 100)
    let efficiencyScore = 100;
    // Deduct for loop alerts
    efficiencyScore -= loops.length * 20;

    // Deduct for identical calls
    const toolSignatures = new Set<string>();
    let redundantCalls = 0;
    for (const tc of toolCalls) {
      const sig = `${tc.payload?.tool || tc.payload?.name}:${JSON.stringify(tc.payload?.arguments || tc.payload?.args || {})}`;
      if (toolSignatures.has(sig)) {
        redundantCalls++;
      } else {
        toolSignatures.add(sig);
      }
    }
    efficiencyScore -= redundantCalls * 10;

    // Token consumption efficiency penalty
    if (session.totalTokens > 150_000) {
      efficiencyScore -= 25;
    } else if (session.totalTokens > 80_000) {
      efficiencyScore -= 15;
    }
    efficiencyScore = Math.max(0, Math.min(100, efficiencyScore));

    // 3. Calculate Reliability Score (0 - 100)
    let reliabilityScore = 100;
    const errorCount = errors.length;
    const errorRatePct = totalSteps > 0 ? Number(((errorCount / totalSteps) * 100).toFixed(1)) : 0;

    reliabilityScore -= Math.round(errorRatePct * 2);
    // Aborted executions
    const abortedEvents = events.filter((e) => e.summary.includes('blocked by rule') || e.summary.includes('Aborted'));
    reliabilityScore -= abortedEvents.length * 20;
    reliabilityScore = Math.max(0, Math.min(100, reliabilityScore));

    // 4. Calculate Speed & Latency Score (0 - 100)
    let speedScore = 100;
    const toolDurations = events.filter((e) => e.durationMs !== undefined).map((e) => e.durationMs as number);
    const avgDuration = toolDurations.length > 0
      ? toolDurations.reduce((a, b) => a + b, 0) / toolDurations.length
      : 50;

    if (avgDuration > 5000) speedScore = 55;
    else if (avgDuration > 2000) speedScore = 75;
    else if (avgDuration > 1000) speedScore = 85;
    else speedScore = 100;

    // Overall Score (Weighted)
    const overallScore = Math.round(
      safetyScore * 0.35 + efficiencyScore * 0.25 + reliabilityScore * 0.25 + speedScore * 0.15
    );

    // Letter Grade
    let grade: TrajectoryEvaluation['grade'] = 'A+';
    if (overallScore >= 95) grade = 'A+';
    else if (overallScore >= 85) grade = 'A';
    else if (overallScore >= 75) grade = 'B';
    else if (overallScore >= 60) grade = 'C';
    else if (overallScore >= 45) grade = 'D';
    else grade = 'F';

    // Recommendations
    const recommendations: string[] = [];
    if (allFindings.some((f) => f.category === 'secret_leak')) {
      recommendations.push('Sanitize credentials: leaked secrets were detected in tool payloads. Use environment variables.');
    }
    if (allFindings.some((f) => f.category === 'destructive_command')) {
      recommendations.push('Add Breakpoint Rule: destructive commands were detected. Set a Human-in-the-Loop breakpoint.');
    }
    if (allFindings.some((f) => f.category === 'prompt_injection')) {
      recommendations.push('Sanitize tool outputs: potential indirect prompt injection found in retrieved payloads.');
    }
    if (allFindings.some((f) => f.category === 'ssrf_attempt')) {
      recommendations.push('Restrict network access: private IP or cloud metadata endpoints were targeted.');
    }
    if (loops.length > 0) {
      recommendations.push(`Resolve tool looping: ${loops.length} loop/oscillation alerts detected. Add break conditions.`);
    }
    if (redundantCalls > 2) {
      recommendations.push(`Cache tool results: ${redundantCalls} redundant identical tool calls wasted context tokens.`);
    }
    if (errorRatePct > 15) {
      recommendations.push(`Improve tool error recovery: high error rate (${errorRatePct}%). Inspect failed tool arguments.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('Excellent trajectory: no security vulnerabilities, loops, or critical errors detected.');
    }

    const durationMs = events.length > 1
      ? Math.max(0, (events[events.length - 1].timestamp || 0) - (events[0].timestamp || 0))
      : 0;

    return {
      overallScore,
      grade,
      dimensions: {
        efficiency: efficiencyScore,
        safety: safetyScore,
        reliability: reliabilityScore,
        speed: speedScore
      },
      metrics: {
        totalSteps,
        toolCalls: toolCalls.length,
        errorRatePct,
        redundantCalls,
        securityFindingsCount: allFindings.length,
        loopCount: loops.length,
        totalCostUsd: session.costEvaluation?.estimatedCostUsd || 0,
        durationMs
      },
      recommendations
    };
  }
}
