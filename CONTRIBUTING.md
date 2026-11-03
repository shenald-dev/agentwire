# Contributing to agentwire

First off, thank you for considering contributing to **agentwire**! We welcome bug reports, pull requests, and discussions.

## 🛠️ Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/shenald-dev/agentwire.git
   cd agentwire
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build TypeScript:
   ```bash
   npm run build
   # Or continuous compile:
   npm run watch
   ```
4. Run the automated test suite:
   ```bash
   npm test
   ```

## 📐 Adding New Inspection Features

- **Core Events:** Update `src/types.ts` and `src/core/session.ts`.
- **Breakpoints:** Add custom evaluator logic in `src/core/breakpoints.ts`.
- **Web Dashboard:** Enhance the zero-dependency SPA in `public/index.html`.
- **Tests:** Add corresponding tests in `tests/` using Node's native `node:test` runner.

## 📜 Pull Request Guidelines
- Ensure all tests pass (`npm test`).
- Keep dependencies minimal to maintain <30ms startup latency.
- Adhere to the [Code of Conduct](CODE_OF_CONDUCT.md).
