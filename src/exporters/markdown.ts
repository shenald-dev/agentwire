/**
 * agentwire - Markdown Audit & Evaluation Report Exporter
 */

import { SerializedSession } from '../types.js';
import { calculateSessionCost } from '../utils/cost.js';
import { SecurityAuditor } from '../core/security.js';
import { TrajectoryEvaluator } from '../core/eval-engine.js';

export function exportToMarkdown(session: SerializedSession, modelKey = 'default'): string {
  const cost = calculateSessionCost({ totalEstimatedTokens: session.totalTokens }, modelKey);
  const evaluation = TrajectoryEvaluator.evaluate(session);
  const events = session.events || [];

  // Collect all security findings across events
  const allFindings = events.flatMap((ev) => {
    const findings = ev.securityFindings || SecurityAuditor.audit(ev.payload);
    return findings.map((f) => ({ ...f, step: ev.stepIndex, summary: ev.summary }));
  });

  const toolCalls = events.filter((e) => e.kind === 'tool_call');
  const errors = events.filter((e) => e.kind === 'error');
  const pauses = events.filter((e) => e.kind === 'breakpoint_hit');
  const loops = events.filter((e) => e.loopAlert !== undefined && e.loopAlert !== null);

  let md = `# ⚡ agentwire Trajectory Diagnostic Report\n\n`;

  // Score Card
  md += `## 📊 Trajectory Quality & SLA Scorecard\n\n`;
  md += `> **Overall Score: ${evaluation.overallScore}/100 (Grade: ${evaluation.grade})**\n\n`;
  md += `| Dimension | Score | Assessment |\n`;
  md += `| :--- | :--- | :--- |\n`;
  md += `| 🛡️ **Safety & Integrity** | ${evaluation.dimensions.safety}/100 | ${evaluation.dimensions.safety >= 80 ? 'Pass' : 'Requires Hardening'} |\n`;
  md += `| ⚡ **Efficiency & Tokens** | ${evaluation.dimensions.efficiency}/100 | ${evaluation.dimensions.efficiency >= 80 ? 'Optimal' : 'Token Waste Detected'} |\n`;
  md += `| 🔄 **Reliability & Recovery** | ${evaluation.dimensions.reliability}/100 | ${evaluation.dimensions.reliability >= 80 ? 'Resilient' : 'Errors/Aborts Flagged'} |\n`;
  md += `| ⏱️ **Speed & Latency** | ${evaluation.dimensions.speed}/100 | ${evaluation.dimensions.speed >= 80 ? 'Fast' : 'High Tool Latency'} |\n\n`;

  md += `### 💡 Recommendations\n`;
  for (const rec of evaluation.recommendations) {
    md += `- ${rec}\n`;
  }
  md += `\n`;

  // Key Attributes
  md += `## 📋 Session Overview\n\n`;
  md += `| Attribute | Value |\n`;
  md += `| :--- | :--- |\n`;
  md += `| **Session ID** | \`${session.sessionId}\` |\n`;
  md += `| **Agent Profile** | ${session.agentName || 'Standard Agent'} |\n`;
  md += `| **Recorded Date** | ${new Date(session.createdAt).toISOString()} |\n`;
  md += `| **Total Steps** | ${events.length} |\n`;
  md += `| **Tool Invocations** | ${toolCalls.length} |\n`;
  md += `| **Total Estimated Tokens** | ~${session.totalTokens.toLocaleString()} |\n`;
  md += `| **Estimated Cost (${cost.modelName})** | **${cost.formattedCost}** |\n`;
  md += `| **Context Window Consumption** | ${cost.contextUsedPct}% of ${cost.contextWindow.toLocaleString()} tokens |\n\n`;

  // Security Audit
  md += `## 🛡️ Security & Integrity Audit\n\n`;
  if (allFindings.length === 0) {
    md += `> ✅ **Clean Session:** Zero credential leaks, prompt injections, SSRF, or destructive commands detected.\n\n`;
  } else {
    md += `> ⚠️ **${allFindings.length} Security Finding(s) Detected:**\n\n`;
    md += `| Step | Severity | Category | Description | Remediation |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;
    for (const f of allFindings) {
      md += `| #${f.step} | **${f.severity.toUpperCase()}** | \`${f.category}\` | ${f.description} | ${f.remediation || 'Inspect payload'} |\n`;
    }
    md += `\n`;
  }

  // Loop & Oscillation Alerts
  if (loops.length > 0) {
    md += `## 🔄 Loop & Oscillation Incidents\n\n`;
    md += `| Step | Type | Tool | Incidents |\n`;
    md += `| :--- | :--- | :--- | :--- |\n`;
    for (const l of loops) {
      const alert = l.loopAlert!;
      md += `| #${l.stepIndex} | \`${alert.type}\` | \`${alert.toolName}\` | ${alert.message} |\n`;
    }
    md += `\n`;
  }

  // Breakpoints & Interceptions
  if (pauses.length > 0) {
    md += `## ⏸️ Breakpoint Interceptions\n\n`;
    md += `| Step | Matched Pattern | Action Taken |\n`;
    md += `| :--- | :--- | :--- |\n`;
    for (const p of pauses) {
      md += `| #${p.stepIndex} | \`${p.payload?.matchedPattern || 'Rule'}\` | Paused & Inspected |\n`;
    }
    md += `\n`;
  }

  // Errors
  if (errors.length > 0) {
    md += `## ❌ Captured Failures & Exceptions\n\n`;
    for (const err of errors) {
      md += `### Step #${err.stepIndex}: ${err.summary}\n`;
      md += `\`\`\`json\n${JSON.stringify(err.payload, null, 2)}\n\`\`\`\n\n`;
    }
  }

  // Trajectory Timeline
  md += `## 📜 Execution Timeline\n\n`;
  md += `| Step | Kind | Source | Summary | Tokens |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- |\n`;
  for (const ev of events) {
    const tokens = ev.metrics?.totalEstimatedTokens ? `~${ev.metrics.totalEstimatedTokens}` : '-';
    md += `| #${ev.stepIndex} | \`${ev.kind}\` | ${ev.source} | ${ev.summary.replace(/\|/g, '\\|')} | ${tokens} |\n`;
  }

  md += `\n---\n*Generated by [@shenald/agentwire](https://github.com/shenald-dev/agentwire) — The Wireshark for AI Agents*\n`;
  return md;
}
