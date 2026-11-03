/**
 * agentwire - DevTools Web Server
 * Real-time SSE streaming, session introspection, and breakpoint control
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WireSession } from '../core/session.js';
import { BreakpointEngine } from '../core/breakpoints.js';
import { WireEvent } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface WebServerOptions {
  session: WireSession;
  breakpointEngine: BreakpointEngine;
  port?: number;
  publicDir?: string;
}

export class WebServer {
  private server?: http.Server;
  private session: WireSession;
  private breakpointEngine: BreakpointEngine;
  private port: number;
  private publicDir: string;
  private sseClients: Set<http.ServerResponse> = new Set();

  constructor(options: WebServerOptions) {
    this.session = options.session;
    this.breakpointEngine = options.breakpointEngine;
    this.port = options.port || 4400;
    this.publicDir = options.publicDir || path.resolve(__dirname, '../../public');

    // Subscribe to session events and broadcast via SSE
    this.session.on('event', (event: WireEvent) => {
      this.broadcastSse({ type: 'event', data: event });
    });

    this.breakpointEngine.on('hit', (hit) => {
      this.broadcastSse({ type: 'breakpoint_hit', data: hit });
    });

    this.breakpointEngine.on('resumed', (data) => {
      this.broadcastSse({ type: 'breakpoint_resumed', data });
    });
  }

  /**
   * Starts the DevTools HTTP server
   */
  public start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        reject(err);
      });

      this.server.listen(this.port, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : this.port;
        resolve(actualPort);
      });
    });
  }

  /**
   * Stops the server
   */
  public stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const client of this.sseClients) {
        client.end();
      }
      this.sseClients.clear();

      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Internal HTTP router
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase();

    // Enable CORS for flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API Routes
    if (pathname === '/api/events' && method === 'GET') {
      this.handleSseStream(req, res);
      return;
    }

    if (pathname === '/api/session' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.session.exportJson()));
      return;
    }

    if (pathname === '/api/breakpoints' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(this.breakpointEngine.getRules()));
      return;
    }

    if (pathname === '/api/breakpoints' && method === 'POST') {
      this.readJsonBody(req, (data) => {
        this.breakpointEngine.addRule(data);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rules: this.breakpointEngine.getRules() }));
      });
      return;
    }

    if (pathname === '/api/resume' && method === 'POST') {
      this.readJsonBody(req, (data) => {
        const { hitId, action, payload } = data;
        let success = false;
        if (hitId) {
          success = this.breakpointEngine.resume(hitId, action || 'continue', payload);
        } else {
          success = this.breakpointEngine.resumeNext(action || 'continue', payload);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: success }));
      });
      return;
    }

    if (pathname === '/api/branch' && method === 'POST') {
      this.readJsonBody(req, (data) => {
        const { stepIndex, description } = data;
        try {
          const branch = this.session.branchFromStep(Number(stepIndex), description);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, branch, session: this.session.exportJson() }));
        } catch (err: any) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // Static Assets
    let filePath = path.join(this.publicDir, pathname === '/' ? 'index.html' : pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.svg': 'image/svg+xml'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  }

  /**
   * SSE Stream Handler
   */
  private handleSseStream(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ type: 'init', session: this.session.exportJson() })}\n\n`);

    this.sseClients.add(res);

    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  /**
   * Broadcasts a JSON message to all connected SSE clients
   */
  private broadcastSse(data: any): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  private readJsonBody(req: http.IncomingMessage, callback: (data: any) => void): void {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        callback(json);
      } catch {
        callback({});
      }
    });
  }
}
