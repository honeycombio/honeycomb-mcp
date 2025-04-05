# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Honeycomb MCP Development Guide

## Build & Test Commands
- Build: `pnpm run build`
- Typecheck: `pnpm typecheck`
- Run all tests: `pnpm test`
- Run tests with watch mode: `pnpm test:watch`
- Run single test: `pnpm test -- -t "test name"` (pattern matches test descriptions)
- Run tests in specific file: `pnpm test -- src/path/to/file.test.ts`
- Run with coverage: `pnpm test:coverage`

## Code Style Guidelines
- **TypeScript**: Use explicit types for parameters, variables, and return values
- **Imports**: Group external libs first, then internal; use named imports with destructuring
- **Modules**: Use ES modules with `.js` extension in import paths
- **Naming**: camelCase for variables/methods, PascalCase for classes/interfaces/types
- **Error Handling**: Use custom `HoneycombError` class for API errors; centralized error handling
- **Testing**: Use Vitest with `vi` for mocks; test both success and error cases
- **Async**: Use async/await consistently; handle promise rejections with try/catch
- **Type Validation**: Use Zod schemas for validating external data
- **API Design**: Methods should be focused with clear parameters and return types
- **Documentation**: Add comments for complex operations and public methods
- **Caching**: Use `@stacksjs/ts-cache` for resource caching; normalize keys as `environment:resource:id`