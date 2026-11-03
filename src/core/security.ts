/**
 * agentwire - Security & Leak Audit Engine
 * Inspects tool payloads and agent outputs for leaked secrets, path traversals, and destructive operations
 */

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'secret_leak' | 'path_traversal' | 'destructive_command' | 'sensitive_file_access';
  description: string;
  matchedPattern: string;
  location?: string;
}

export class SecurityAuditor {
  private static SECRET_PATTERNS: Array<{ name: string; regex: RegExp; severity: SecurityFinding['severity'] }> = [
    {
      name: 'OpenAI Secret Key',
      regex: /\b(sk-[a-zA-Z0-9]{20,T3BlbkFJ[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9_-]{40,})\b/,
      severity: 'critical'
    },
    {
      name: 'Anthropic API Key',
      regex: /\b(sk-ant-[a-zA-Z0-9_-]{40,})\b/,
      severity: 'critical'
    },
    {
      name: 'GitHub Personal Access Token',
      regex: /\b(ghp_[a-zA-Z0-9]{36,40}|gho_[a-zA-Z0-9]{36,40}|github_pat_[a-zA-Z0-9_]{82})\b/,
      severity: 'critical'
    },
    {
      name: 'AWS Access Key ID',
      regex: /\b(AKIA[0-9A-Z]{16})\b/,
      severity: 'high'
    },
    {
      name: 'Private Encryption Key',
      regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
      severity: 'critical'
    },
    {
      name: 'Generic API Bearer Token',
      regex: /\bBearer\s+[a-zA-Z0-9_\-\.]{32,}\b/i,
      severity: 'medium'
    }
  ];

  private static PATH_TRAVERSAL_PATTERNS: Array<{ name: string; regex: RegExp; severity: SecurityFinding['severity'] }> = [
    {
      name: 'Directory Traversal Sequence',
      regex: /(?:\.\.(?:[\/\\]|\\\\)){2,}/,
      severity: 'high'
    },
    {
      name: 'Sensitive System Path (/etc/passwd, shadow)',
      regex: /(?:\/etc\/(?:passwd|shadow|sudoers|master\.passwd)|\/Windows\/System32\/config)/i,
      severity: 'critical'
    },
    {
      name: 'SSH Key Access',
      regex: /(?:\.ssh\/(?:id_rsa|id_ed25519|known_hosts|authorized_keys))/i,
      severity: 'critical'
    },
    {
      name: 'Environment / Secrets File Access',
      regex: /(?:\.env(?:\.[a-zA-Z0-9_-]+)?|\.aws\/credentials|\.kube\/config)/i,
      severity: 'high'
    }
  ];

  private static DESTRUCTIVE_COMMANDS: Array<{ name: string; regex: RegExp; severity: SecurityFinding['severity'] }> = [
    {
      name: 'Recursive Root Deletion',
      regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|-[a-zA-Z]*f*r[a-zA-Z]*)\s+(?:\/|~|\$HOME|\.\.)(?:\s|$)/,
      severity: 'critical'
    },
    {
      name: 'Fork Bomb',
      regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
      severity: 'critical'
    },
    {
      name: 'Filesystem Format / Raw Overwrite',
      regex: /\b(mkfs(?:\.[a-z0-9]+)?|dd\s+if=[^\s]+\s+of=\/dev\/)/,
      severity: 'critical'
    },
    {
      name: 'Database Drop Table / Database',
      regex: /\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i,
      severity: 'high'
    }
  ];

  /**
   * Audits any payload (string, object, tool arguments) and returns detected security findings
   */
  public static audit(data: any): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const text = typeof data === 'string' ? data : JSON.stringify(data || '');

    // 1. Audit for leaked secrets
    for (const pat of this.SECRET_PATTERNS) {
      if (pat.regex.test(text)) {
        findings.push({
          severity: pat.severity,
          category: 'secret_leak',
          description: `Potential secret exposure: ${pat.name}`,
          matchedPattern: pat.name
        });
      }
    }

    // 2. Audit for path traversal
    for (const pat of this.PATH_TRAVERSAL_PATTERNS) {
      if (pat.regex.test(text)) {
        findings.push({
          severity: pat.severity,
          category: 'path_traversal',
          description: `Suspicious file access pattern: ${pat.name}`,
          matchedPattern: pat.name
        });
      }
    }

    // 3. Audit for destructive commands
    for (const pat of this.DESTRUCTIVE_COMMANDS) {
      if (pat.regex.test(text)) {
        findings.push({
          severity: pat.severity,
          category: 'destructive_command',
          description: `Destructive system operation: ${pat.name}`,
          matchedPattern: pat.name
        });
      }
    }

    return findings;
  }
}
