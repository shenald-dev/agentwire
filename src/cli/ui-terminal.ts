/**
 * agentwire - Terminal Dashboard Renderer
 */

import pc from 'picocolors';
import { WireEvent } from '../types.js';

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
}

export function renderBanner(version = '0.1.0', port?: number): void {
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
