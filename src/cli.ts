/**
 * agentwire - CLI Controller
 */

import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import pc from 'picocolors';
import { WireSession } from './core/session.js';
import { BreakpointEngine } from './core/breakpoints.js';
import { MockEngine } from './core/mock-engine.js';
import { McpProxy } from './proxy/mcp-proxy.js';
import { HttpProxy } from './proxy/http-proxy.js';
import { WebServer } from './server/web-server.js';
import { renderBanner, renderTerminalEvent, renderDiffSummary } from './cli/ui-terminal.js';
import { TrajectoryDiff } from './core/diff-engine.js';
import { exportToMarkdown } from './exporters/markdown.js';
import { exportToHar } from './exporters/har.js';

export async function runCli(argv = process.argv): Promise<void> {
  const program = new Command();

  program
    .name('agentwire')
    .description('The Wireshark & Live Time-Travel Debugger for AI Agents & MCP Workflows')
    .version('0.2.0');

  // Command 1: agentwire mcp <command...>
  program
    .command('mcp')
    .description('Proxy and wiretap a Model Context Protocol (MCP) server over stdio')
    .argument('<command...>', 'The MCP server command and arguments to spawn')
    .option('-p, --port <number>', 'Port for the DevTools Web Dashboard', '4400')
    .option('--no-ui', 'Disable automatic web dashboard startup')
    .option('-e, --export <path>', 'Export session JSON on exit')
    .option('--step', 'Step-through mode: pause execution on every tool call')
    .option('--model <name>', 'Target model for cost calculation (e.g. claude-3.5-sonnet, gpt-4o)', 'default')
    .option('--mock-file <path>', 'JSON file containing virtual mock tool rules')
    .action(async (commandArgs: string[], options) => {
      const port = parseInt(options.port, 10);
      const session = new WireSession(`MCP: ${commandArgs.join(' ')}`);
      session.modelKey = options.model;

      const breakpointEngine = new BreakpointEngine([
        {
          id: 'bp_destructive',
          enabled: true,
          type: 'tool_arg_regex',
          pattern: 'rm\\s+-rf|drop\\s+table|delete\\s+from',
          action: 'pause',
          description: 'Pause on potentially destructive shell commands'
        },
        {
          id: 'bp_security_leaks',
          enabled: true,
          type: 'secret_leak',
          pattern: 'secret_leak',
          action: 'alert',
          description: 'Alert on detected secret/credential exposure'
        },
        {
          id: 'bp_loop_guard',
          enabled: true,
          type: 'infinite_loop',
          pattern: 'loop',
          action: 'pause',
          description: 'Pause when identical tool call loop is detected'
        }
      ]);

      const mockEngine = new MockEngine();
      if (options.mockFile && fs.existsSync(options.mockFile)) {
        try {
          const rawMocks = JSON.parse(fs.readFileSync(options.mockFile, 'utf-8'));
          if (Array.isArray(rawMocks)) {
            for (const m of rawMocks) mockEngine.addMock(m);
            session.setMocks(rawMocks);
          }
        } catch {
          // Ignore invalid mock file
        }
      }

      let webServer: WebServer | undefined;
      if (options.ui) {
        webServer = new WebServer({ session, breakpointEngine, mockEngine, port });
        const actualPort = await webServer.start();
        renderBanner('0.2.0', actualPort);
      } else {
        renderBanner('0.2.0');
      }

      session.on('event', (ev) => {
        renderTerminalEvent(ev);
      });

      const [cmd, ...args] = commandArgs;
      const proxy = new McpProxy({
        session,
        breakpointEngine,
        mockEngine,
        command: cmd,
        args,
        stepMode: Boolean(options.step)
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

  // Command 2: agentwire proxy (HTTP / SSE proxy)
  program
    .command('proxy')
    .description('Wiretap an HTTP / SSE network MCP server or REST API endpoint')
    .requiredOption('-t, --target <url>', 'Target MCP HTTP/SSE server URL')
    .option('-p, --port <number>', 'Listen port for the HTTP proxy wiretap', '4401')
    .option('--ui-port <number>', 'Port for the DevTools Web Dashboard', '4400')
    .option('--no-ui', 'Disable DevTools web dashboard')
    .option('-e, --export <path>', 'Export session JSON on exit')
    .action(async (options) => {
      const listenPort = parseInt(options.port, 10);
      const uiPort = parseInt(options.uiPort, 10);

      const session = new WireSession(`HTTP Proxy: ${options.target}`);
      const breakpointEngine = new BreakpointEngine();
      const mockEngine = new MockEngine();

      let webServer: WebServer | undefined;
      if (options.ui) {
        webServer = new WebServer({ session, breakpointEngine, mockEngine, port: uiPort });
        const actualUiPort = await webServer.start();
        renderBanner('0.2.0', actualUiPort);
      } else {
        renderBanner('0.2.0');
      }

      session.on('event', (ev) => {
        renderTerminalEvent(ev);
      });

      const httpProxy = new HttpProxy({
        session,
        breakpointEngine,
        mockEngine,
        targetUrl: options.target,
        listenPort
      });

      const actualProxyPort = await httpProxy.start();
      console.log(pc.cyan(`\n⚡ HTTP Proxy wiretap listening on http://localhost:${actualProxyPort}`));
      console.log(pc.dim(`Forwarding all agent requests to ${options.target}\n`));
    });

  // Command 3: agentwire diff <fileA> <fileB>
  program
    .command('diff')
    .description('Compare two session recording files to pinpoint divergence, token drift, and errors')
    .argument('<fileA>', 'First session file (.agentwire.json)')
    .argument('<fileB>', 'Second session file (.agentwire.json)')
    .action(async (fileA: string, fileB: string) => {
      if (!fs.existsSync(fileA)) {
        console.error(pc.red(`Error: File not found: ${fileA}`));
        process.exit(1);
      }
      if (!fs.existsSync(fileB)) {
        console.error(pc.red(`Error: File not found: ${fileB}`));
        process.exit(1);
      }

      const sessionA = JSON.parse(fs.readFileSync(fileA, 'utf-8'));
      const sessionB = JSON.parse(fs.readFileSync(fileB, 'utf-8'));

      const diff = TrajectoryDiff.compare(sessionA, sessionB);
      renderDiffSummary(diff);
    });

  // Command 4: agentwire report <file>
  program
    .command('report')
    .description('Generate a diagnostic Markdown or HAR audit report from a session file')
    .argument('<file>', 'Session recording file (.agentwire.json)')
    .option('-o, --output <path>', 'Output Markdown file path')
    .option('--har <path>', 'Export as HTTP Archive (HAR 1.2) file')
    .option('--model <name>', 'Pricing model (e.g. gpt-4o, claude-3.5-sonnet)', 'default')
    .action(async (file: string, options) => {
      if (!fs.existsSync(file)) {
        console.error(pc.red(`Error: File not found: ${file}`));
        process.exit(1);
      }

      const sessionData = JSON.parse(fs.readFileSync(file, 'utf-8'));

      if (options.har) {
        const har = exportToHar(sessionData);
        fs.writeFileSync(options.har, JSON.stringify(har, null, 2), 'utf-8');
        console.log(pc.green(`✔ Exported HAR archive to ${options.har}`));
      }

      const md = exportToMarkdown(sessionData, options.model);
      if (options.output) {
        fs.writeFileSync(options.output, md, 'utf-8');
        console.log(pc.green(`✔ Exported diagnostic Markdown report to ${options.output}`));
      } else if (!options.har) {
        console.log(md);
      }
    });

  // Command 5: agentwire ui
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
      renderBanner('0.2.0', actualPort);

      console.log(pc.cyan(`\nDashboard is running at http://localhost:${actualPort}`));
      console.log(pc.dim(`Press Ctrl+C to stop.`));
    });

  // Command 6: agentwire inspect <file>
  program
    .command('inspect')
    .description('Inspect and time-travel replay a recorded agentwire session file')
    .argument('<file>', 'Path to the .agentwire.json session file')
    .option('-p, --port <number>', 'Port for the web dashboard', '4400')
    .action(async (filePath: string, options) => {
      const port = parseInt(options.port, 10);
      const resolvedPath = path.resolve(filePath);

      if (!fs.existsSync(resolvedPath)) {
        console.error(pc.red(`Error: File not found: ${resolvedPath}`));
        process.exit(1);
      }

      try {
        const raw = fs.readFileSync(resolvedPath, 'utf-8');
        const sessionData = JSON.parse(raw);
        const session = WireSession.importJson(sessionData);
        const breakpointEngine = new BreakpointEngine(session.getBreakpoints());

        const webServer = new WebServer({ session, breakpointEngine, port });
        const actualPort = await webServer.start();
        renderBanner('0.2.0', actualPort);

        console.log(pc.cyan(`\nReplaying session '${session.id}' (${session.getEvents().length} events)`));
        console.log(pc.green(`Inspect in DevTools: ${pc.bold(`http://localhost:${actualPort}`)}`));
        console.log(pc.dim(`Press Ctrl+C to stop.`));
      } catch (err: any) {
        console.error(pc.red(`Failed to parse session file: ${err.message}`));
        process.exit(1);
      }
    });

  await program.parseAsync(argv);
}
