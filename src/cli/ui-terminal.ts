/**
 * agentwire - Terminal Dashboard Renderer
 */

import pc from 'picocolors';
import { WireEvent } from '../types.js';
import { DiffResult } from '../core/diff-engine.js';

export function renderTerminalEvent(event: WireEvent): void {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const step = pc.dim(`[#${event.stepIndex}]`);
  const tokens = pc.cyan(`(${event.metrics.totalEstimatedTokens} tk)`);

  let kindBadge = '';
  switch (event.kind) {
    case 'tool_call':
      kindBadge = pc.bold(pc.cyan('⚡ TOOL_CALL'));
      break;
    case 'tool_result':
      kindBadge = pc.bold(pc.green('✔ RESULT   '));
      break;
    case 'prompt_turn':
      kindBadge = pc.bold(pc.magenta('💬 TURN     '));
      break;
    case 'breakpoint_hit':
      kindBadge = pc.bold(pc.yellow('⏸ PAUSE    '));
      break;
    case 'error':
      kindBadge = pc.bold(pc.red('✖ ERROR    '));
      break;
    default:
      kindBadge = pc.dim('• EVENT    ');
      break;
  }

  const summary = event.summary.length > 55 ? `${event.summary.slice(0, 52)}...` : event.summary;
  console.log(`${pc.dim(time)} ${step} ${kindBadge} ${summary.padEnd(56)} ${tokens}`);

  if (event.paused) {
    console.log(
      pc.yellow(`   └── ⏸ BREAKPOINT HIT: Execution held by agentwire. Open Web UI to resume or edit payload.`)
    );
  }

  if (event.securityFindings && event.securityFindings.length > 0) {
    for (const f of event.securityFindings) {
      console.log(
        pc.red(`   ⚠️  SECURITY ALERT [${f.severity.toUpperCase()}]: ${f.description} (${f.matchedPattern})`)
      );
    }
  }

  if (event.loopAlert) {
    console.log(
      pc.yellow(`   🔄 LOOP DETECTED: ${event.loopAlert.message}`)
    );
  }
}

export function renderDiffSummary(diff: DiffResult): void {
  console.log(pc.bold(pc.cyan(`\n=== 🔍 agentwire Trajectory Diff Analysis ===\n`)));
  console.log(`Session A (${diff.sessionA.id}): ${diff.sessionA.eventCount} steps | ~${diff.sessionA.totalTokens.toLocaleString()} tokens | ${diff.errorsA} errors`);
  console.log(`Session B (${diff.sessionB.id}): ${diff.sessionB.eventCount} steps | ~${diff.sessionB.totalTokens.toLocaleString()} tokens | ${diff.errorsB} errors`);

  const sign = diff.tokensDiff > 0 ? '+' : '';
  const tokenColor = diff.tokensDiff <= 0 ? pc.green : pc.yellow;
  console.log(`Token Delta: ${tokenColor(`${sign}${diff.tokensDiff.toLocaleString()} tokens (${sign}${diff.tokensPctChange}%)`)}`);

  console.log(`Identical Prefix: ${diff.identicalPrefixSteps} steps shared before deviation.`);

  if (diff.divergenceStepIndex !== null) {
    console.log(pc.yellow(`\n⚠️ Divergence Point Identified at Step #${diff.divergenceStepIndex}:`));
    console.log(pc.dim(`  Reason: ${diff.divergenceReason}`));
    if (diff.divergingEventA) {
      console.log(pc.red(`  Session A: [${diff.divergingEventA.kind}] ${diff.divergingEventA.summary}`));
    }
    if (diff.divergingEventB) {
      console.log(pc.green(`  Session B: [${diff.divergingEventB.kind}] ${diff.divergingEventB.summary}`));
    }
  } else {
    console.log(pc.green(`\n✔ Trajectories are structurally identical.`));
  }
  console.log();
}

export function renderBanner(version = '0.2.0', port?: number): void {
  console.log(`
${pc.cyan('  █████╗  ██████╗ ███████╗███╗   ██╗████████╗██╗    ██╗██╗██████╗ ███████╗')}
${pc.cyan(' ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝██║    ██║██║██╔══██╗██╔════╝')}
${pc.cyan(' ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██║ █╗ ██║██║██████╔╝█████╗  ')}
${pc.cyan(' ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║███╗██║██║██╔══██╗██╔══╝  ')}
${pc.cyan(' ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ╚███╔███╔╝██║██║  ██║███████╗')}
${pc.cyan(' ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝    ╚══╝╚══╝ ╚═╝╚═╝  ╚═╝╚══════╝')}
  ${pc.bold('The Wireshark & Live Time-Travel Debugger for AI Agents & MCP Workflows')} ${pc.dim(`v${version}`)}
`);

  if (port) {
    console.log(pc.green(`  🌐 DevTools Web Dashboard: ${pc.bold(`http://localhost:${port}`)}`));
    console.log(pc.dim(`  Ready to intercept, inspect, and debug agent traffic.\n`));
  }
}
