/**
 * agentwire - CLI Controller
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { WireSession } from './core/session.js';
import { BreakpointEngine } from './core/breakpoints.js';
import { McpProxy } from './proxy/mcp-proxy.js';
import { WebServer } from './server/web-server.js';
import { renderBanner, renderTerminalEvent } from './cli/ui-terminal.js';

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('agentwire')
    .description('The Wireshark & Live Time-Travel Debugger for AI Agents & MCP Workflows')
    .version('0.1.0');

  // Command 1: agentwire mcp <command...>
  program
    .command('mcp')
    .description('Proxy and wiretap a Model Context Protocol (MCP) server over stdio')
    .argument('<command...>', 'The MCP server command and arguments to spawn')
    .option('-p, --port <number>', 'Port for the DevTools Web Dashboard', '4400')
    .option('--no-ui', 'Disable automatic web dashboard startup')
    .option('-e, --export <path>', 'Export session JSON on exit')
    .action(async (commandArgs: string[], options) => {
      const port = parseInt(options.port, 10);
      const session = new WireSession(`MCP: ${commandArgs.join(' ')}`);
      const breakpointEngine = new BreakpointEngine([
        {
          id: 'bp_destructive',
          enabled: true,
          type: 'tool_arg_regex',
          pattern: 'rm\\s+-rf|drop\\s+table|delete\\s+from',
          action: 'pause',
          description: 'Pause on potentially destructive shell commands'
        }
      ]);

      let webServer: WebServer | undefined;
      if (options.ui) {
        webServer = new WebServer({ session, breakpointEngine, port });
        const actualPort = await webServer.start();
        renderBanner('0.1.0', actualPort);
      } else {
        renderBanner('0.1.0');
      }

      session.on('event', (ev) => {
        renderTerminalEvent(ev);
      });

      const [cmd, ...args] = commandArgs;
      const proxy = new McpProxy({
        session,
        breakpointEngine,
        command: cmd,
        args
      });

      proxy.on('exit', () => {
        if (options.export) {
          fs.writeFileSync(options.export, JSON.stringify(session.exportJson(), null, 2));
          console.log(pc.green(`\nSession saved to ${options.export}`));
        }
        process.exit(0);
      });

      proxy.start();
    });

  // Command 2: agentwire ui
  program
    .command('ui')
    .description('Start the standalone DevTools Web Dashboard')
    .option('-p, --port <number>', 'Port for the web dashboard', '4400')
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      const session = new WireSession('Standalone Dashboard');
      const breakpointEngine = new BreakpointEngine();
      const webServer = new WebServer({ session, breakpointEngine, port });
      const actualPort = await webServer.start();
      renderBanner('0.1.0', actualPort);

      console.log(pc.cyan(`\nDashboard is running at http://localhost:${actualPort}`));
      console.log(pc.dim(`Press Ctrl+C to stop.`));
    });

  // Command 3: agentwire inspect <file>
  program
    .command('inspect')
    .description('Inspect and time-travel replay a recorded agentwire session file')
    .argument('<file>', 'Path to the .agentwire.json session file')
    .option('-p, --port <number>', 'Port for the web dashboard', '4400')
    .action(async (filePath: string, options) => {
      const port = parseInt(options.port, 10);
      const absolutePath = path.resolve(process.cwd(), filePath);

      if (!fs.existsSync(absolutePath)) {
        console.error(pc.red(`File not found: ${absolutePath}`));
        process.exit(1);
      }

      const raw = fs.readFileSync(absolutePath, 'utf-8');
      const data = JSON.parse(raw);
      const session = WireSession.importJson(data);
      const breakpointEngine = new BreakpointEngine(session.getBreakpoints());

      const webServer = new WebServer({ session, breakpointEngine, port });
      const actualPort = await webServer.start();
      renderBanner('0.1.0', actualPort);

      console.log(pc.green(`Loaded recorded session: ${pc.bold(session.id)} (${session.getEvents().length} events, ${session.getTotalTokens()} tokens)`));
      console.log(pc.cyan(`Explore in browser: http://localhost:${actualPort}\n`));
    });

  await program.parseAsync(argv);
}
