/**
 * agentwire - Mock Engine
 * Intercepts tool calls and returns virtual responses without executing actual tools
 */

export interface MockRule {
  id: string;
  enabled: boolean;
  toolName: string;
  argPattern?: string; // Optional regex to match against arguments
  response: any; // JSON-RPC result content or object
  description?: string;
}

export class MockEngine {
  private mocks: Map<string, MockRule> = new Map();

  constructor(initialMocks: MockRule[] = []) {
    for (const m of initialMocks) {
      this.addMock(m);
    }
  }

  public addMock(rule: MockRule): void {
    this.mocks.set(rule.id, { ...rule });
  }

  public removeMock(id: string): boolean {
    return this.mocks.delete(id);
  }

  public getMocks(): MockRule[] {
    return Array.from(this.mocks.values());
  }

  /**
   * Checks if a tool call has a matching mock response
   */
  public match(toolName: string, args: any): MockRule | null {
    const argsStr = JSON.stringify(args || {});
    for (const mock of this.mocks.values()) {
      if (!mock.enabled) continue;
      if (mock.toolName.toLowerCase() !== toolName.toLowerCase()) continue;

      if (mock.argPattern) {
        try {
          const regex = new RegExp(mock.argPattern, 'i');
          if (!regex.test(argsStr)) continue;
        } catch {
          continue;
        }
      }

      return mock;
    }
    return null;
  }
}
