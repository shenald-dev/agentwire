/**
 * agentwire - HTTP Archive (HAR 1.2) Exporter
 * Enables importing AI agent trajectories directly into Chrome DevTools, Proxyman, or Charles Proxy
 */

import { SerializedSession } from '../types.js';

export function exportToHar(session: SerializedSession): any {
  const events = session.events || [];
  const entries: any[] = [];

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === 'tool_call') {
      // Find matching tool_result if available
      const nextResult = events.slice(i + 1).find((e) => e.kind === 'tool_result');
      const toolName = ev.payload?.tool || ev.payload?.name || 'mcp_tool';
      const reqBody = JSON.stringify(ev.payload || {}, null, 2);
      const resBody = nextResult ? JSON.stringify(nextResult.payload || {}, null, 2) : '{}';

      entries.push({
        startedDateTime: new Date(ev.timestamp).toISOString(),
        time: ev.durationMs || 50,
        request: {
          method: 'POST',
          url: `mcp://agentwire/tools/${toolName}`,
          httpVersion: 'HTTP/1.1',
          headers: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'X-Agentwire-Step', value: String(ev.stepIndex) }
          ],
          queryString: [],
          cookies: [],
          headersSize: -1,
          bodySize: Buffer.byteLength(reqBody),
          postData: {
            mimeType: 'application/json',
            text: reqBody
          }
        },
        response: {
          status: 200,
          statusText: 'OK',
          httpVersion: 'HTTP/1.1',
          headers: [
            { name: 'Content-Type', value: 'application/json' }
          ],
          cookies: [],
          content: {
            size: Buffer.byteLength(resBody),
            mimeType: 'application/json',
            text: resBody
          },
          redirectURL: '',
          headersSize: -1,
          bodySize: Buffer.byteLength(resBody)
        },
        cache: {},
        timings: {
          send: 0,
          wait: ev.durationMs || 50,
          receive: 0
        }
      });
    }
  }

  return {
    log: {
      version: '1.2',
      creator: {
        name: 'agentwire',
        version: '0.2.0'
      },
      pages: [
        {
          startedDateTime: new Date(session.createdAt).toISOString(),
          id: session.sessionId,
          title: session.agentName || 'AI Agent MCP Session',
          pageTimings: {
            onContentLoad: -1,
            onLoad: -1
          }
        }
      ],
      entries
    }
  };
}
