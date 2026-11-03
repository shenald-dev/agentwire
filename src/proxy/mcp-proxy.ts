/**
 * agentwire - MCP Stdio Proxy Engine
 * Intercepts Model Context Protocol (MCP) JSON-RPC streams between agents and tools
 */

import { spawn, ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { EventEmitter } from 'node:events';
import { WireSession } from '../core/session.js';
import { BreakpointEngine } from '../core/breakpoints.js';
import { WireEvent } from '../types.js';

export interface McpProxyOptions {
  session: WireSession;
  breakpointEngine: BreakpointEngine;
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export class McpProxy extends EventEmitter {
  private session: WireSession;
  private breakpointEngine: BreakpointEngine;
  private childProcess?: ChildProcess;
  private command: string;
  private args: string[];
  private cwd?: string;
  private env?: NodeJS.ProcessEnv;
  private isRunning = false;

  constructor(options: McpProxyOptions) {
    super();
    this.session = options.session;
    this.breakpointEngine = options.breakpointEngine;
    this.command = options.command;
    this.args = options.args || [];
    this.cwd = options.cwd;
    this.env = options.env;
  }

  /**
   * Spawns the child MCP server and bridges stdio streams
   */
  public start(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout
  ): void {
    if (this.isRunning) return;
    this.isRunning = true;

    this.session.recordEvent('session_start', 'system', `Proxying MCP Server: ${this.command} ${this.args.join(' ')}`, {
      command: this.command,
      args: this.args
    });

    const isWindows = process.platform === 'win32';
    const isBatchOrCmd = isWindows && (this.command.endsWith('.cmd') || this.command.endsWith('.bat'));
    this.childProcess = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: isBatchOrCmd
    });

    // Handle Agent -> MCP Server (stdin)
    const agentRl = readline.createInterface({
      input,
      crlfDelay: Infinity,
      terminal: false
    });

    agentRl.on('line', async (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const jsonRpc = JSON.parse(trimmed);
        await this.handleAgentMessage(jsonRpc);
      } catch {
        // Raw non-JSON line pass-through
        if (this.childProcess?.stdin && !this.childProcess.stdin.destroyed) {
          this.childProcess.stdin.write(line + '\n');
        }
      }
    });

    // Handle MCP Server -> Agent (stdout)
    if (this.childProcess.stdout) {
      const serverRl = readline.createInterface({
        input: this.childProcess.stdout,
        crlfDelay: Infinity,
        terminal: false
      });

      serverRl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const jsonRpc = JSON.parse(trimmed);
          this.handleServerMessage(jsonRpc);
        } catch {
          // Ignore
        }

        output.write(line + '\n');
      });
    }

    // Handle stderr from child process
    if (this.childProcess.stderr) {
      this.childProcess.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        this.session.recordEvent('error', 'tool', text.slice(0, 100), { raw: text });
      });
    }

    this.childProcess.on('exit', (code, signal) => {
      this.isRunning = false;
      this.session.recordEvent('session_end', 'system', `MCP Server exited with code ${code}`, {
        code,
        signal
      });
      this.emit('exit', { code, signal });
    });
  }

  /**
   * Processes messages sent by the AI Agent to the MCP Server
   */
  private async handleAgentMessage(msg: any): Promise<void> {
    const method = msg.method;
    const isToolCall = method === 'tools/call';

    let event: WireEvent;

    if (isToolCall) {
      const toolName = msg.params?.name || 'unknown_tool';
      const args = msg.params?.arguments || {};
      event = this.session.recordEvent('tool_call', 'agent', `Call tool: ${toolName}`, {
        id: msg.id,
        tool: toolName,
        arguments: args
      });

      // Breakpoint check
      const evalResult = await this.breakpointEngine.evaluate(event);

      if (evalResult.aborted) {
        this.session.recordEvent('error', 'proxy', `Tool call blocked by breakpoint rule: ${evalResult.hitRule?.pattern}`, {
          blockedMessage: msg
        });
        return;
      }

      if (evalResult.modifiedPayload) {
        msg.params.arguments = evalResult.modifiedPayload;
      }
    } else {
      event = this.session.recordEvent('prompt_turn', 'agent', `MCP Request: ${method || 'rpc'}`, msg);
    }

    const payloadStr = JSON.stringify(msg);
    if (this.childProcess?.stdin && !this.childProcess.stdin.destroyed) {
      this.childProcess.stdin.write(payloadStr + '\n');
    }
  }

  /**
   * Processes responses sent by the MCP Server back to the AI Agent
   */
  private handleServerMessage(msg: any): void {
    if (msg.result?.content || msg.result?.tools) {
      const hasContent = Array.isArray(msg.result.content);
      const summary = hasContent
        ? `Tool output (${msg.result.content.length} blocks)`
        : `MCP Response (id: ${msg.id})`;

      this.session.recordEvent('tool_result', 'tool', summary, msg);
    } else if (msg.error) {
      this.session.recordEvent('error', 'tool', `MCP Error: ${msg.error.message || 'unknown'}`, msg.error);
    }
  }

  /**
   * Terminates the proxy and child server
   */
  public stop(): void {
    if (this.childProcess) {
      this.childProcess.kill();
      this.isRunning = false;
    }
  }
}
