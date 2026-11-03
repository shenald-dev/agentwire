# Changelog

All notable changes to **`agentwire`** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
