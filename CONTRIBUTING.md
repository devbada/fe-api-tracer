# Contributing to fe-api-tracer

Thank you for your interest in contributing! This document explains how to get started.

## Development Setup

```bash
git clone https://github.com/your-org/fe-api-tracer
cd fe-api-tracer
npm install
npm run build
```

## Project Structure

```
packages/
  core/       → scanner engine (framework-agnostic)
  adapters/   → one folder per framework
  cli/        → CLI entry point
examples/     → one working example per adapter
```

## Adding a New Framework Adapter

1. Copy `packages/adapters/nextjs-pages/` as a template
2. Implement `FrameworkAdapter` interface in `index.ts`
3. Add `detect()` logic so the CLI can auto-detect
4. Add an example project under `examples/`
5. Update the support table in `README.md`

## Pull Request Guidelines

- One feature or fix per PR
- Include an example that demonstrates the change
- Update README if adding a new adapter or config option
- Run `npm test` before submitting

## Reporting Issues

Please include:
- Framework and version (e.g. Next.js 14, Nuxt 3.10)
- TypeScript version
- The API call pattern that wasn't detected
- Expected vs actual output
