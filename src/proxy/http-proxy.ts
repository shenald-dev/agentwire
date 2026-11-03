/**
 * agentwire - HTTP / SSE MCP Proxy Wiretap
 * Intercepts HTTP and Server-Sent Event MCP and LLM API streams
 */

import * as http from 'node:http';
import { EventEmitter } from 'node:events';
import { WireSession } from '../core/session.js';
import { BreakpointEngine } from '../core/breakpoints.js';
import { MockEngine } from '../core/mock-engine.js';
import { SecurityAuditor } from '../core/security.js';

export interface HttpProxyOptions {
  session: WireSession;
  breakpointEngine: BreakpointEngine;
  mockEngine?: MockEngine;
  targetUrl: string;
  listenPort: number;
}

export class HttpProxy extends EventEmitter {
  private server?: http.Server;
  private session: WireSession;
  private breakpointEngine: BreakpointEngine;
  private mockEngine?: MockEngine;
  private targetUrl: URL;
  private listenPort: number;

  constructor(options: HttpProxyOptions) {
    super();
    this.session = options.session;
    this.breakpointEngine = options.breakpointEngine;
    this.mockEngine = options.mockEngine;
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

      // Record request event
      const reqEvent = this.session.recordEvent(
        parsedBody?.method === 'tools/call' ? 'tool_call' : 'prompt_turn',
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

      // Check Mocks
      if (parsedBody?.method === 'tools/call' && this.mockEngine) {
        const toolName = parsedBody.params?.name;
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

      // Forward request to target
      const targetReqUrl = new URL(path, this.targetUrl);
      const headers = { ...clientReq.headers, host: this.targetUrl.host };
      delete headers['content-length'];

      const proxyReq = http.request(
        targetReqUrl,
        {
          method,
          headers: {
            ...headers,
            'Content-Length': Buffer.byteLength(body)
          }
        },
        (targetRes) => {
          clientRes.writeHead(targetRes.statusCode || 200, targetRes.headers);

          let resBody = '';
          targetRes.on('data', (chunk) => {
            resBody += chunk;
            clientRes.write(chunk);
          });

          targetRes.on('end', () => {
            clientRes.end();
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
