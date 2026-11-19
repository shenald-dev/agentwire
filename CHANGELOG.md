# Changelog

All notable changes to **`agentwire`** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-11-19

### Flagship Evolution — Security Guardrails, Chaos Studio, SLA Evaluation & Reproduction Generator

- 🛡️ **Prompt Injection, SSRF & Data Exfiltration Guard**:
  - Heuristic defense against indirect prompt injection, instruction overrides (`disregard previous instructions`), developer mode bypasses, delimiter injections, and markdown image exfiltration.
  - SSRF detection targeting AWS/GCP/Azure instance metadata endpoints (`169.254.169.254`, `metadata.google.internal`), loopback addresses (`127.0.0.1`, `localhost`), and private RFC 1918 subnets.
  - Covert exfiltration pattern detection (outbound webhook POSTs with sensitive file payloads, DNS tunneling).
- 🧹 **Automated Secret Scrubber & Redaction Engine (`SecretScrubber` / `--redact`)**:
  - Automatically identifies and masks credentials in strings, arrays, and complex nested objects (`sk-proj-****[REDACTED]`, `ghp_****[REDACTED]`, `AIza****[REDACTED]`, `AKIA****[REDACTED]`, private keys).
  - Web UI 1-click secret redaction toggle and CLI `--redact` flag for sharing sanitized traces safely.
- 🔥 **Chaos & Fault Simulation Studio (`ChaosEngine` / `--chaos-*`)**:
  - Synthetic latency jitter injection (`--chaos-delay <ms>`) to test agent timeout handling and race conditions.
  - Configurable error rate simulation (`--chaos-rate <rate>`) and HTTP 429 rate limit mocking.
  - `failCount` support to simulate transient network faults (fail $N$ times, then succeed) for retry testing.
  - Interactive Chaos Studio inside the DevTools Web Dashboard.
- 📊 **Agent Trajectory Quality & SLA Evaluation Engine (`agentwire eval`)**:
  - Quantitative scoring (0-100) and letter grades (A+ to F) across Safety, Efficiency, Reliability, and Speed.
  - CI/CD quality gate enforcement (`agentwire eval <file> --threshold 80`) with non-zero exit code on SLA violation.
  - Actionable system prompt and tool constraint optimization recommendations.
- 🧪 **Deterministic Reproduction Test Generator (`agentwire export-test`)**:
  - 1-click generation of runnable offline regression test scripts (`node:test` and `jest` formats) from recorded `.agentwire.json` session files.
  - Zero LLM token cost reproduction and regression testing for CI/CD pipelines.
- 🔄 **Advanced Multi-Period Loop & Error Thrashing Detector**:
  - Extended from period 2 to arbitrary period-$k$ cycle detection ($k=3$ e.g. $A \rightarrow B \rightarrow C \rightarrow A \rightarrow B \rightarrow C$, $k=4$).
  - Error thrashing detector alerting when 3 consecutive tool calls fail without strategy adaptation.
- 💰 **Expanded Model Pricing & Cache Hit Accounting**:
  - Added Claude 3.7 Sonnet, Claude 3.5 Haiku, OpenAI o1, o1-mini, o3-mini, GPT-4.5 Preview, Gemini 2.0 Flash/Pro, DeepSeek V3/R1, and Llama 3.3 70B.
  - Support for prompt caching discounts (up to 90% savings) and reasoning/thinking token metrics.
- ⚡ **High-Throughput Benchmarking Suite**:
  - New reproducible benchmark script (`npm run benchmark`) measuring over 92,000 events/sec throughput and sub-millisecond latencies.
- 🧪 **Expanded Test Suite**:
  - 41 native tests across 15 suites executing in ~600ms with zero test failures.

---

## [0.2.0] - 2026-11-03

### Major v1 Evolution — Security, Loop Detection, Mocking & Multi-Transport Wiretap

- 🌐 **HTTP & SSE Proxy Wiretap (`agentwire proxy`)**:
  - Full support for remote HTTP and Server-Sent Event (SSE) MCP servers and LLM endpoints.
  - Transparent forward proxying, request/response payload capture, and live event streaming.
- 🛡️ **Autonomous Security & Leak Auditor**:
  - Real-time heuristic detection of secret & credential exposures (OpenAI keys, Anthropic keys, GitHub PATs, AWS Access Keys, private keys, bearer tokens).
  - High-confidence path traversal detection (`../../`, `/etc/passwd`, sensitive dotfiles, Windows system paths).
  - Destructive command interception (`rm -rf /`, `DROP DATABASE`, `mkfs`, raw disk formats).
- 🔄 **Infinite Loop & Oscillation Detector**:
  - Instant detection of consecutive identical tool calls (e.g. repeated failure to read a nonexistent file).
  - Period-2 cyclical oscillation detection (`[toolA ⇄ toolB]`) catching agent hallucination loops before context exhaustion.
- 🎭 **Virtual Tool Mocking Engine (`--mock-file`)**:
  - Intercept tool calls matching name and argument regexes and inject synthetic responses without executing actual tools.
  - Allows offline unit testing of agent trajectories, chaos engineering, and simulated server error conditions.
- ⚖️ **Trajectory Diff Engine (`agentwire diff`)**:
  - Side-by-side comparative analysis of two agent trajectories.
  - Automatically identifies exact divergence step index, tool selection drift, token count variations, and error emergence.
- 💰 **Token Valuation, Cost & Context Exhaustion Gauge**:
  - Live cost tracking across Claude 3.5 Sonnet, Claude 3 Opus, GPT-4o, GPT-4o Mini, and Gemini 1.5 Pro.
  - Real-time context window usage gauge alerting users when an agent approaches 70% (warning) or 90% (critical) capacity.
- 📑 **Diagnostic Markdown & HAR 1.2 Exporters**:
  - `agentwire report <session.json>`: Generates executive Markdown audit summaries with security findings, breakpoint log, and cost analysis.
  - Standard HTTP Archive (HAR 1.2) export for importing agent trajectories into Chrome DevTools, Proxyman, or Charles.
- 🐾 **Step-Through Single-Step Mode (`agentwire mcp --step`)**:
  - Developer step-through debugging pausing after every tool invocation for granular inspection.
- 🧪 **Comprehensive Test Suite**:
  - Expanded test suite to 29 native tests across 10 suites (`node:test`), maintaining sub-400ms execution with zero external test dependencies.

---

## [0.1.0] - 2026-11-03

### Initial Release
- ⚡ **The Wireshark for AI Agents**: Transparently intercept, inspect, and wiretap Model Context Protocol (MCP) JSON-RPC streams and agent tool calls.
- ⏸️ **Breakpoints for Agents**: Pause execution before destructive tool calls (`rm -rf`, `drop table`, custom regex), inspect parameters, approve, modify arguments inline, or abort.
- 📊 **Visual Token Waterfall**: Real-time token consumption telemetry tracking prompt tokens, completion tokens, and tool result payloads.
- ⏪ **Time-Travel Trajectory Replay**: Rewind to step `N`, fork an alternative reasoning branch, and explore new trajectories without restarting sessions.
- 🌐 **Embedded DevTools Web Dashboard**: Built-in zero-dependency dark-mode cybernetic SPA with real-time Server-Sent Events (SSE) updates (`agentwire ui` / `http://localhost:4400`).
- 🖥️ **Terminal Live Card Mode**: High-contrast ANSI event cards for headless terminal power users.
- 🧪 **Automated Native Verification**: 100% pass rate across 14 comprehensive unit and integration tests via `node:test` (<350ms).
- 📦 **Zero-Install Execution**: Seamless `npx agentwire` and `npx @shenald/agentwire` support.
