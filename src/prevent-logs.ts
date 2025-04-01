// This module prevents console output from interfering with MCP protocol
// It prevents any console logs from being written to stderr or stdout

// Track original console functions
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Create a silenced console
export function silenceConsoleLogs() {
  // Override console methods to no-op
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
}

// Restore console functions if needed
export function restoreConsoleLogs() {
  console.log = originalConsoleLog;
  console.info = originalConsoleInfo;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
}