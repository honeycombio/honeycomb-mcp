import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HoneycombAPI } from "./api/client.js";
import process from "node:process";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";
import { MCPServer } from "./types/mcp.js";

/**
 * Main function to run the Honeycomb MCP server
 */
async function main() {
  // Load config and create API client
  const config = loadConfig();
  const api = new HoneycombAPI(config);

  // Create server with proper initialization options
  const server = new McpServer({
    name: "honeycomb",
    version: "1.0.0"
  });

  // Register resources and tools
  registerResources(server as unknown as MCPServer, api);
  registerTools(server as unknown as MCPServer, api);

  // Create transport and start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Honeycomb MCP Server running on stdio");
}

// Run main with proper error handling
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
