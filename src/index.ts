import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HoneycombAPI } from "./api/client.js";
import process from "node:process";
import { registerResources } from "./resources/index.js";
import { registerTools } from "./tools/index.js";
import { registerPrompts } from "./prompts/index.js";

/**
 * Main function to run the Honeycomb MCP server
 */
async function main() {
  try {
    // Load config asynchronously and create API client
    console.error("Loading configuration from environment variables...");
    const config = await loadConfig();
    console.error(`Loaded ${config.environments.length} environment(s): ${config.environments.map(e => e.name).join(', ')}`);
    
    const api = new HoneycombAPI(config);

    // Create server with proper initialization options and capabilities
    const server = new McpServer({
      name: "honeycomb",
      version: "1.0.0",
      capabilities: {
        prompts: {} // Register prompts capability
      }
    });

    // Add a small delay to ensure the server is fully initialized before registering tools
    console.error("Initializing MCP server...");
    await new Promise(resolve => setTimeout(resolve, 500));

    // Register resources, tools, and prompts
    console.error("Registering resources, tools, and prompts...");
    registerResources(server, api);
    registerTools(server, api);
    registerPrompts(server);

    // Wait for registration to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    console.error("All resources, tools, and prompts registered");

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
        console.error("Honeycomb MCP Server running on stdio");
      } catch (error) {
        retries++;
        console.error(`Connection attempt ${retries} failed: ${error instanceof Error ? error.message : String(error)}`);
        
        if (retries < maxRetries) {
          console.error(`Retrying in 1 second...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error(`Max retries (${maxRetries}) reached. Server may be unstable.`);
          // Continue anyway, but warn about potential issues
          console.error("Honeycomb MCP Server running with potential connection issues");
          break;
        }
      }
    }
  } catch (error) {
    console.error("Failed to start MCP server:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

// Run main with proper error handling
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}
