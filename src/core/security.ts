/**
 * agentwire - Security, Prompt Guard & Leak Audit Engine
 * Inspects tool payloads and agent outputs for leaked secrets, path traversals, prompt injections, SSRF, and destructive operations.
 */

export interface SecurityFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category:
    | 'secret_leak'
    | 'path_traversal'
    | 'destructive_command'
    | 'sensitive_file_access'
    | 'prompt_injection'
    | 'ssrf_attempt'
    | 'data_exfiltration';
  description: string;
  matchedPattern: string;
  location?: string;
  remediation?: string;
}

export class SecurityAuditor {
  private static SECRET_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    severity: SecurityFinding['severity'];
    maskPrefix: string;
  }> = [
    {
      name: 'OpenAI Secret Key',
      regex: /\b(sk-[a-zA-Z0-9]{20,T3BlbkFJ[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9_-]{40,})\b/g,
      severity: 'critical',
      maskPrefix: 'sk-proj-'
    },
    {
      name: 'Anthropic API Key',
      regex: /\b(sk-ant-[a-zA-Z0-9_-]{40,})\b/g,
      severity: 'critical',
      maskPrefix: 'sk-ant-'
    },
    {
      name: 'GitHub Personal Access Token',
      regex: /\b(ghp_[a-zA-Z0-9]{36,40}|gho_[a-zA-Z0-9]{36,40}|github_pat_[a-zA-Z0-9_]{82})\b/g,
      severity: 'critical',
      maskPrefix: 'ghp_'
    },
    {
      name: 'Google AI / Gemini Key',
      regex: /\b(AIza[0-9A-Za-z-_]{35})\b/g,
      severity: 'critical',
      maskPrefix: 'AIza'
    },
    {
      name: 'Hugging Face Token',
      regex: /\b(hf_[a-zA-Z0-9]{34,})\b/g,
      severity: 'critical',
      maskPrefix: 'hf_'
    },
    {
      name: 'Slack Token',
      regex: /\b(xox[baprs]-[0-9a-zA-Z-]{10,})\b/g,
      severity: 'high',
      maskPrefix: 'xox-'
    },
    {
      name: 'AWS Access Key ID',
      regex: /\b(AKIA[0-9A-Z]{16})\b/g,
      severity: 'high',
      maskPrefix: 'AKIA'
    },
    {
      name: 'Private Encryption Key',
      regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
      severity: 'critical',
      maskPrefix: '-----BEGIN PRIVATE KEY-----'
    },
    {
      name: 'Generic API Bearer Token',
      regex: /\bBearer\s+([a-zA-Z0-9_\-\.]{32,})\b/gi,
      severity: 'medium',
      maskPrefix: 'Bearer '
    }
  ];

  private static PATH_TRAVERSAL_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    severity: SecurityFinding['severity'];
    remediation: string;
  }> = [
    {
      name: 'Directory Traversal Sequence',
      regex: /(?:\.\.(?:[\/\\]|\\\\)){2,}/,
      severity: 'high',
      remediation: 'Sanitize target path and restrict access to approved workspace boundaries.'
    },
    {
      name: 'Sensitive System Path (/etc/passwd, shadow)',
      regex: /(?:\/etc\/(?:passwd|shadow|sudoers|master\.passwd)|\/Windows\/System32\/config)/i,
      severity: 'critical',
      remediation: 'Block system root credential file access.'
    },
    {
      name: 'SSH Key Access',
      regex: /(?:\.ssh\/(?:id_rsa|id_ed25519|known_hosts|authorized_keys))/i,
      severity: 'critical',
      remediation: 'Restrict access to ~/.ssh credential directory.'
    },
    {
      name: 'Environment / Secrets File Access',
      regex: /(?:\.env(?:\.[a-zA-Z0-9_-]+)?|\.aws\/credentials|\.kube\/config)/i,
      severity: 'high',
      remediation: 'Prevent agent from reading plaintext credential files.'
    }
  ];

  private static DESTRUCTIVE_COMMANDS: Array<{
    name: string;
    regex: RegExp;
    severity: SecurityFinding['severity'];
    remediation: string;
  }> = [
    {
      name: 'Recursive Root Deletion',
      regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f*|-[a-zA-Z]*f*r[a-zA-Z]*)\s+(?:\/|~|\$HOME|\.\.)(?:\s|$)/,
      severity: 'critical',
      remediation: 'Require explicit human-in-the-loop authorization before deleting directory trees.'
    },
    {
      name: 'Fork Bomb',
      regex: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
      severity: 'critical',
      remediation: 'Immediately abort execution of self-replicating fork bomb script.'
    },
    {
      name: 'Filesystem Format / Raw Overwrite',
      regex: /\b(mkfs(?:\.[a-z0-9]+)?|dd\s+if=[^\s]+\s+of=\/dev\/)/,
      severity: 'critical',
      remediation: 'Block raw disk overwrite and filesystem partition commands.'
    },
    {
      name: 'Database Drop Table / Database',
      regex: /\b(DROP\s+DATABASE|DROP\s+TABLE|TRUNCATE\s+TABLE)\b/i,
      severity: 'high',
      remediation: 'Require explicit approval before dropping database entities.'
    }
  ];

  private static PROMPT_INJECTION_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    severity: SecurityFinding['severity'];
    remediation: string;
  }> = [
    {
      name: 'Instruction Override / Disregard Prompt',
      regex: /(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules|commands|constraints)/i,
      severity: 'critical',
      remediation: 'Payload contains prompt injection attempt trying to wipe system constraints.'
    },
    {
      name: 'System Prompt Hijack / Developer Mode',
      regex: /(?:system\s+prompt\s+override|override\s+system\s+prompt|developer\s+mode\s+enabled|jailbreak\s+mode|dan\s+mode)/i,
      severity: 'high',
      remediation: 'Payload contains persona hijacking / jailbreak attempt.'
    },
    {
      name: 'Roleplay Delimiter Injection',
      regex: /(?:\n\n(?:Human|Assistant|System):\s*|\b(?:\[SYSTEM\s+INSTRUCTION\]|<system>|<instruction>)\b)/i,
      severity: 'medium',
      remediation: 'Payload embeds artificial conversation boundary markers to trick the LLM.'
    },
    {
      name: 'Markdown Image Exfiltration URL',
      regex: /!\[[^\]]*\]\((?:https?:\/\/[^\s\)]+(?:\?|&)(?:token|secret|key|pwd|leak|auth)=)/i,
      severity: 'critical',
      remediation: 'Possible visual markdown rendering exfiltration attempting to leak tokens via image requests.'
    }
  ];

  private static SSRF_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    severity: SecurityFinding['severity'];
    remediation: string;
  }> = [
    {
      name: 'Cloud Metadata Service Access (AWS/GCP/Azure)',
      regex: /(?:169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200)/i,
      severity: 'critical',
      remediation: 'Block access to cloud provider instance metadata endpoints to prevent IAM credential theft.'
    },
    {
      name: 'Loopback Service Access (localhost / 127.0.0.1)',
      regex: /(?:https?:\/\/|connect\s+to\s+)(?:127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(?::\d+)?(?:\/|\b)/i,
      severity: 'medium',
      remediation: 'Validate whether local port scanning or internal service interaction is authorized.'
    },
    {
      name: 'Private Network Range Access (RFC 1918)',
      regex: /(?:https?:\/\/)(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(?::\d+)?(?:\/|\b)/i,
      severity: 'medium',
      remediation: 'Ensure external tool requests cannot access internal subnet microservices.'
    }
  ];

  private static DATA_EXFILTRATION_PATTERNS: Array<{
    name: string;
    regex: RegExp;
    severity: SecurityFinding['severity'];
    remediation: string;
  }> = [
    {
      name: 'DNS Tunneling Command Pattern',
      regex: /(?:dig|nslookup|host)\s+[^\s]+\.[a-zA-Z0-9-]+\.(?:com|org|net|io|me|xyz)\s+\$\(/i,
      severity: 'high',
      remediation: 'Possible DNS tunneling command pattern attempting covert exfiltration.'
    },
    {
      name: 'Suspicious Webhook Exfiltration Post',
      regex: /(?:curl|wget)\s+-[a-zA-Z0-9]*d\s+["']?[^\s"']*(?:base64|passwd|shadow|\.env|\.ssh|id_rsa)/i,
      severity: 'critical',
      remediation: 'Agent attempted to send file contents or sensitive credentials over HTTP POST.'
    }
  ];

  /**
   * Safely serializes data to a string with circular reference protection
   */
  public static safeStringify(data: any): string {
    if (typeof data === 'string') return data;
    if (data === null || data === undefined) return '';
    try {
      const seen = new WeakSet();
      return JSON.stringify(data, (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular]';
          }
          seen.add(value);
        }
        return value;
      });
    } catch {
      return String(data);
    }
  }

  /**
   * Audits any payload (string, object, tool arguments) and returns detected security findings
   */
  public static audit(data: any): SecurityFinding[] {
    const findings: SecurityFinding[] = [];
    const text = typeof data === 'string' ? data : this.safeStringify(data);

    // 1. Audit for leaked secrets
    for (const pat of this.SECRET_PATTERNS) {
      // Reset regex state if global
      pat.regex.lastIndex = 0;
      if (pat.regex.test(text)) {
        findings.push({
          severity: pat.severity,
          category: 'secret_leak',
          description: `Potential secret exposure: ${pat.name}`,
          matchedPattern: pat.name,
          remediation: 'Redact credential from tool arguments and rotate exposed keys.'
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
          matchedPattern: pat.name,
          remediation: pat.remediation
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
          matchedPattern: pat.name,
          remediation: pat.remediation
        });
      }
    }

    // 4. Audit for prompt injections
    for (const pat of this.PROMPT_INJECTION_PATTERNS) {
      if (pat.regex.test(text)) {
        findings.push({
          severity: pat.severity,
          category: 'prompt_injection',
          description: `Potential prompt injection / constraint override: ${pat.name}`,
          matchedPattern: pat.name,
          remediation: pat.remediation
        });
      }
    }

    // 5. Audit for SSRF
    for (const pat of this.SSRF_PATTERNS) {
      if (pat.regex.test(text)) {
        findings.push({
          severity: pat.severity,
          category: 'ssrf_attempt',
          description: `SSRF or Private Network Target: ${pat.name}`,
          matchedPattern: pat.name,
          remediation: pat.remediation
        });
      }
    }

    // 6. Audit for Data Exfiltration
    for (const pat of this.DATA_EXFILTRATION_PATTERNS) {
      if (pat.regex.test(text)) {
        findings.push({
          severity: pat.severity,
          category: 'data_exfiltration',
          description: `Potential data exfiltration attempt: ${pat.name}`,
          matchedPattern: pat.name,
          remediation: pat.remediation
        });
      }
    }

    return findings;
  }
}

/**
 * SecretScrubber
 * Automatically sanitizes and redacts credentials from objects, strings, and session records
 */
export class SecretScrubber {
  public static redactString(input: string): { redacted: string; count: number } {
    let text = input;
    let count = 0;

    // OpenAI keys (sk-proj- or standard sk-)
    text = text.replace(
      /\b(sk-(?:proj-)?[a-zA-Z0-9_-]{6,10})[a-zA-Z0-9_-]{10,}\b/g,
      (_m, prefix) => {
        count++;
        return `${prefix}****[REDACTED]`;
      }
    );

    // Anthropic keys
    text = text.replace(
      /\b(sk-ant-[a-zA-Z0-9_-]{6})[a-zA-Z0-9_-]{20,}\b/g,
      (_m, prefix) => {
        count++;
        return `${prefix}****[REDACTED]`;
      }
    );

    // GitHub PATs
    text = text.replace(
      /\b(ghp_[a-zA-Z0-9]{4})[a-zA-Z0-9]{20,}\b/g,
      (_m, prefix) => {
        count++;
        return `${prefix}****[REDACTED]`;
      }
    );

    // Google Gemini
    text = text.replace(
      /\b(AIza[0-9A-Za-z-_]{6})[0-9A-Za-z-_]{20,}\b/g,
      (_m, prefix) => {
        count++;
        return `${prefix}****[REDACTED]`;
      }
    );

    // AWS Access Key
    text = text.replace(
      /\b(AKIA[0-9A-Z]{4})[0-9A-Z]{12}\b/g,
      (_m, prefix) => {
        count++;
        return `${prefix}****[REDACTED]`;
      }
    );

    // Private Keys
    text = text.replace(
      /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
      () => {
        count++;
        return '-----BEGIN PRIVATE KEY-----\n[REDACTED PRIVATE KEY]\n-----END PRIVATE KEY-----';
      }
    );

    // Bearer token
    text = text.replace(
      /\b(Bearer\s+)[a-zA-Z0-9_\-\.]{10,}\b/gi,
      (_m, prefix) => {
        count++;
        return `${prefix}****[REDACTED]`;
      }
    );

    return { redacted: text, count };
  }

  public static redact<T = any>(data: T, seen = new WeakSet()): { redacted: T; count: number } {
    if (data === null || data === undefined) {
      return { redacted: data, count: 0 };
    }

    if (typeof data === 'string') {
      const res = this.redactString(data);
      return { redacted: res.redacted as unknown as T, count: res.count };
    }

    if (typeof data !== 'object') {
      return { redacted: data, count: 0 };
    }

    // Preserve special non-plain object types like Date, RegExp, Buffer
    if (data instanceof Date || data instanceof RegExp || (typeof Buffer !== 'undefined' && Buffer.isBuffer(data))) {
      return { redacted: data, count: 0 };
    }

    // Circular reference protection
    if (seen.has(data as object)) {
      return { redacted: '[Circular]' as unknown as T, count: 0 };
    }
    seen.add(data as object);

    if (Array.isArray(data)) {
      let totalCount = 0;
      const arr = data.map((item) => {
        const itemRes = this.redact(item, seen);
        totalCount += itemRes.count;
        return itemRes.redacted;
      });
      return { redacted: arr as unknown as T, count: totalCount };
    }

    let totalCount = 0;
    const clone: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      const fieldRes = this.redact(val, seen);
      totalCount += fieldRes.count;
      clone[key] = fieldRes.redacted;
    }
    return { redacted: clone as unknown as T, count: totalCount };
  }
}
