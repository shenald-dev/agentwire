# Changelog

All notable changes to **`agentwire`** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
