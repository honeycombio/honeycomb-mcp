import { z } from "zod";
import fs from "fs";
import path from "path";

export const ConfigSchema = z.object({
  environments: z.array(z.object({
    name: z.string(),
    apiKey: z.string(),
    apiEndpoint: z.string().optional(),
  })).min(1, "At least one environment must be configured"),
});

export type Config = z.infer<typeof ConfigSchema>;

function findConfigFile(): string {
  const configPaths = [
    // Look in standard locations
    ".mcp-honeycomb.json",
    path.join(process.cwd(), ".mcp-honeycomb.json"),
    path.join(process.env.HOME || "~", ".mcp-honeycomb.json"),
    // Allow overriding with env var
    process.env.MCP_HONEYCOMB_CONFIG,
  ].filter(Boolean);

  const foundPath = configPaths.find(p => p && fs.existsSync(p));
  if (!foundPath) {
    throw new Error(
      "Configuration file not found. Please create .mcp-honeycomb.json with your environments and API keys"
    );
  }
  return foundPath;
}

export function loadConfig(): Config {
  // Try to load from config file
  const configPath = findConfigFile(); // This will now throw if no file found
  
  try {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return ConfigSchema.parse(fileConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(
        `Configuration error:\n${issues}\n\nExample config file:\n{\n  "environments": [\n    {\n      "name": "prod",\n      "apiKey": "your_api_key",\n      "apiEndpoint": "https://api.honeycomb.io"\n    }\n  ]\n}`
      );
    }
    if (error instanceof SyntaxError) {
      // Failed to parse config file
    }
    throw error;
  }
}
