import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HoneycombAPI } from "./api/client.js";
import process from "node:process";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";
import { silenceConsoleLogs } from "./prevent-logs.js";

/**
 * Main function to run the Honeycomb MCP server
 */
async function main() {
  // Completely silence all console output to prevent MCP protocol issues
  silenceConsoleLogs();
  
  // Load config and create API client
  const config = loadConfig();
  const api = new HoneycombAPI(config);

  // Create server with proper initialization options
  const server = new McpServer({
    name: "honeycomb",
    version: "1.0.0"
  });

  // Add a small delay to ensure the server is fully initialized before registering tools
  // Initialize MCP server silently
  await new Promise(resolve => setTimeout(resolve, 500));

  // Register resources and tools
  registerResources(server, api);
  registerTools(server, api);

  // Wait for tool registration to complete
  await new Promise(resolve => setTimeout(resolve, 500));

  // Create transport and start server
  const transport = new StdioServerTransport();
  
  // Add reconnect logic to handle connection issues
  let connected = false;
  const maxRetries = 3;
  let retries = 0;
  
  while (!connected && retries < maxRetries) {
    try {
      await server.connect(transport);
      connected = true;
    } catch (error) {
      retries++;
      // Connection attempt failed
      
      if (retries < maxRetries) {
        // Retrying connection
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        // Max retries reached
        // Continue anyway, but warn about potential issues
        // Server running with potential issues
        break;
      }
    }
  }
}

// Run main with proper error handling
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    // Fatal error in main
    process.exit(1);
  });
}
