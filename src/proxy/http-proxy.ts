/**
 * agentwire - HTTP / SSE MCP Proxy Wiretap
 * Intercepts HTTP and Server-Sent Event (SSE) MCP and LLM API streams
 * with live streaming pass-through, chaos injection, security audits, and breakpoints.
 */

import * as http from 'node:http';
import * as https from 'node:https';
import { EventEmitter } from 'node:events';
import { WireSession } from '../core/session.js';
import { BreakpointEngine } from '../core/breakpoints.js';
import { MockEngine } from '../core/mock-engine.js';
import { ChaosEngine } from '../core/chaos-engine.js';
import { SecurityAuditor } from '../core/security.js';

export interface HttpProxyOptions {
  session: WireSession;
  breakpointEngine: BreakpointEngine;
  mockEngine?: MockEngine;
  chaosEngine?: ChaosEngine;
  targetUrl: string;
  listenPort: number;
}

export class HttpProxy extends EventEmitter {
  private server?: http.Server;
  private session: WireSession;
  private breakpointEngine: BreakpointEngine;
  private mockEngine?: MockEngine;
  private chaosEngine?: ChaosEngine;
  private targetUrl: URL;
  private listenPort: number;

  constructor(options: HttpProxyOptions) {
    super();
    this.session = options.session;
    this.breakpointEngine = options.breakpointEngine;
    this.mockEngine = options.mockEngine;
    this.chaosEngine = options.chaosEngine;
    this.targetUrl = new URL(options.targetUrl);
    this.listenPort = options.listenPort;
  }

  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => reject(err));

      this.server.listen(this.listenPort, () => {
        const address = this.server?.address();
        const port = typeof address === 'object' && address ? address.port : this.listenPort;
        this.session.recordEvent('session_start', 'proxy', `HTTP Wiretap active on port ${port} -> ${this.targetUrl.href}`, {
          listenPort: port,
          targetUrl: this.targetUrl.href
        });
        resolve(port);
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse): void {
    let body = '';
    clientReq.on('data', (chunk) => (body += chunk));

    clientReq.on('end', async () => {
      let parsedBody: any = null;
      try {
        parsedBody = body ? JSON.parse(body) : null;
      } catch {
        // Raw text
      }

      const method = clientReq.method || 'GET';
      const path = clientReq.url || '/';
      const isToolCall = parsedBody?.method === 'tools/call';
      const toolName = parsedBody?.params?.name || path;

      // Record request event
      const reqEvent = this.session.recordEvent(
        isToolCall ? 'tool_call' : 'prompt_turn',
        'agent',
        `HTTP ${method} ${path}`,
        parsedBody || body
      );

      // Audit security
      const securityFindings = SecurityAuditor.audit(parsedBody || body);
      if (securityFindings.length > 0) {
        this.session.recordEvent('error', 'proxy', `Security Alert: ${securityFindings[0].description}`, {
          findings: securityFindings
        });
      }

      // Check Chaos Engine (supports both tool calls and general HTTP endpoints)
      if (this.chaosEngine) {
        const chaosTargetArgs = isToolCall ? parsedBody?.params?.arguments : parsedBody;
        const chaosResult = await this.chaosEngine.evaluate(toolName, chaosTargetArgs);
        if (chaosResult.action === 'delay') {
          reqEvent.isChaosInjected = true;
          this.session.recordEvent(
            'chaos_fault',
            'proxy',
            `Chaos Latency Injected (${chaosResult.delayMs}ms) on ${toolName}`,
            { delayMs: chaosResult.delayMs, rule: chaosResult.hitRule }
          );
        }
        if (chaosResult.shouldIntercept) {
          reqEvent.isChaosInjected = true;
          this.session.recordEvent(
            'chaos_fault',
            'proxy',
            `Chaos Injected (${chaosResult.action}) on ${toolName}`,
            chaosResult.errorResponse
          );
          const statusCode = chaosResult.action === 'rate_limit' ? 429 : (chaosResult.hitRule?.errorStatusCode || 500);
          clientRes.writeHead(statusCode, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify(chaosResult.errorResponse));
          return;
        }
      }

      // Check Mocks
      if (isToolCall && this.mockEngine) {
        const mock = this.mockEngine.match(toolName, parsedBody.params?.arguments);
        if (mock) {
          const mockResponse = {
            jsonrpc: '2.0',
            id: parsedBody.id,
            result: mock.response
          };
          this.session.recordEvent('tool_result', 'proxy', `Mock response for ${toolName}`, mockResponse);
          clientRes.writeHead(200, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify(mockResponse));
          return;
        }
      }

      // Check Breakpoints
      const evalResult = await this.breakpointEngine.evaluate(reqEvent);
      if (evalResult.aborted) {
        clientRes.writeHead(403, { 'Content-Type': 'application/json' });
        clientRes.end(JSON.stringify({ error: 'Aborted by agentwire breakpoint rule' }));
        return;
      }

      if (evalResult.modifiedPayload && parsedBody?.params) {
        parsedBody.params.arguments = evalResult.modifiedPayload;
        body = JSON.stringify(parsedBody);
      }

      // Forward request to target preserving base path prefix and query string
      const basePath = this.targetUrl.pathname.replace(/\/$/, '');
      const fullPath = basePath ? `${basePath}${path.startsWith('/') ? path : '/' + path}` : path;
      const targetReqUrl = new URL(fullPath, this.targetUrl.origin);
      const headers = { ...clientReq.headers, host: this.targetUrl.host };
      delete headers['content-length'];
      delete headers['transfer-encoding'];

      const isHttps = targetReqUrl.protocol === 'https:';
      const requestFn = isHttps ? https.request : http.request;

      const proxyReq = requestFn(
        targetReqUrl,
        {
          method,
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body)
          }
        },
        (targetRes) => {
          const isSse = (targetRes.headers['content-type'] || '').includes('text/event-stream');
          clientRes.writeHead(targetRes.statusCode || 200, targetRes.headers);

          let resBody = '';
          let sseBuffer = '';
          targetRes.on('data', (chunk) => {
            const str = chunk.toString();
            resBody += str;
            clientRes.write(chunk);

            // Live SSE chunk recording with robust line buffering
            if (isSse) {
              sseBuffer += str;
              let newlineIdx;
              while ((newlineIdx = sseBuffer.indexOf('\n')) !== -1) {
                const line = sseBuffer.slice(0, newlineIdx).trim();
                sseBuffer = sseBuffer.slice(newlineIdx + 1);
                if (line.startsWith('data:')) {
                  const dataContent = line.slice(5).trim();
                  if (dataContent && dataContent !== '[DONE]') {
                    try {
                      const parsed = JSON.parse(dataContent);
                      this.session.recordEvent('prompt_turn', 'tool', `SSE Stream Chunk`, parsed);
                    } catch {
                      this.session.recordEvent('prompt_turn', 'tool', `SSE Stream Chunk`, { text: dataContent });
                    }
                  }
                }
              }
            }
          });

          targetRes.on('end', () => {
            clientRes.end();
            if (isSse && sseBuffer.trim()) {
              const line = sseBuffer.trim();
              if (line.startsWith('data:')) {
                const dataContent = line.slice(5).trim();
                if (dataContent && dataContent !== '[DONE]') {
                  try {
                    const parsed = JSON.parse(dataContent);
                    this.session.recordEvent('prompt_turn', 'tool', `SSE Stream Chunk`, parsed);
                  } catch {
                    this.session.recordEvent('prompt_turn', 'tool', `SSE Stream Chunk`, { text: dataContent });
                  }
                }
              }
            }
            if (!isSse) {
              try {
                const parsedRes = resBody ? JSON.parse(resBody) : null;
                this.session.recordEvent(
                  parsedRes?.result ? 'tool_result' : 'prompt_turn',
                  'tool',
                  `HTTP Response ${targetRes.statusCode} (${path})`,
                  parsedRes || resBody
                );
              } catch {
                // Non-JSON response
              }
            }
          });
        }
      );

      proxyReq.on('error', (err) => {
        this.session.recordEvent('error', 'proxy', `HTTP Forwarding error: ${err.message}`, { error: err.message });
        if (!clientRes.headersSent) {
          clientRes.writeHead(502, { 'Content-Type': 'application/json' });
          clientRes.end(JSON.stringify({ error: `agentwire bad gateway: ${err.message}` }));
        }
      });

      if (body) {
        proxyReq.write(body);
      }
      proxyReq.end();
    });
  }
}
