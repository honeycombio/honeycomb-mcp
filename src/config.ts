import { z } from "zod";
import { AuthResponse } from "./types/api.js";

// Enhanced environment schema with authentication information
export const EnvironmentSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  apiEndpoint: z.string().optional(),
  // Fields that will be populated from the auth endpoint
  teamSlug: z.string().optional(),
  teamName: z.string().optional(),
  environmentSlug: z.string().optional(),
  permissions: z.record(z.boolean()).optional(),
});

export const ConfigSchema = z.object({
  environments: z.array(EnvironmentSchema).min(1, "At least one environment must be configured"),
});

export type Environment = z.infer<typeof EnvironmentSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 * Supports both HONEYCOMB_ENV_*_API_KEY for multiple environments
 * and HONEYCOMB_API_KEY for a single environment
 */
async function loadFromEnvVars(): Promise<Config> {
  const environments: Environment[] = [];
  const envVars = process.env;
  const defaultApiEndpoint = "https://api.honeycomb.io";
  const globalApiEndpoint = envVars.HONEYCOMB_API_ENDPOINT;

  // Check for multi-environment pattern: HONEYCOMB_ENV_*_API_KEY
  const envVarRegex = /^HONEYCOMB_ENV_(.+)_API_KEY$/;
  for (const [key, value] of Object.entries(envVars)) {
    const match = key.match(envVarRegex);
    if (match && match[1] && value) {
      const envName = match[1].toLowerCase();
      environments.push({
        name: envName,
        apiKey: value,
        apiEndpoint: globalApiEndpoint || defaultApiEndpoint,
      });
    }
  }

  // Check for single environment: HONEYCOMB_API_KEY
  if (envVars.HONEYCOMB_API_KEY) {
    environments.push({
      name: "default", // This will be updated with actual name from auth response
      apiKey: envVars.HONEYCOMB_API_KEY,
      apiEndpoint: globalApiEndpoint || defaultApiEndpoint,
    });
  }

  if (environments.length === 0) {
    throw new Error(
      "No Honeycomb configuration found. Please set HONEYCOMB_API_KEY for a single environment " +
      "or HONEYCOMB_ENV_<NAME>_API_KEY for multiple environments."
    );
  }

  return { environments };
}

/**
 * Enhance configuration with data from the Honeycomb API auth endpoint
 */
async function enhanceConfigWithAuth(config: Config): Promise<Config> {
  const enhancedEnvironments: Environment[] = [];

  // Process each environment sequentially to avoid rate limiting
  for (const env of config.environments) {
    try {
      const headers = {
        "X-Honeycomb-Team": env.apiKey,
        "Content-Type": "application/json",
      };

      const response = await fetch(`${env.apiEndpoint}/1/auth`, { headers });
      
      if (!response.ok) {
        throw new Error(`Auth failed for environment ${env.name}: ${response.statusText}`);
      }

      const authInfo = await response.json() as AuthResponse;
      
      enhancedEnvironments.push({
        ...env,
        teamSlug: authInfo.team?.slug,
        teamName: authInfo.team?.name,
        environmentSlug: authInfo.environment?.slug,
        // If this is the default environment from HONEYCOMB_API_KEY, update the name
        name: env.name === "default" && authInfo.environment?.name ? 
          authInfo.environment.name : env.name,
        permissions: authInfo.api_key_access,
      });

      console.error(`Authenticated environment: ${env.name}`);
    } catch (error) {
      console.error(`Failed to authenticate environment ${env.name}: ${error instanceof Error ? error.message : String(error)}`);
      // Still include this environment but without enhancement
      enhancedEnvironments.push(env);
    }
  }

  return { environments: enhancedEnvironments };
}

/**
 * Load and validate configuration from environment variables
 * and enhance with authentication information
 */
export async function loadConfig(): Promise<Config> {
  try {
    // Load initial config from environment variables
    const config = await loadFromEnvVars();
    
    // Enhance with auth information
    return await enhanceConfigWithAuth(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(
        `Configuration error:\n${issues}\n\nPlease set environment variables:\n` +
        `- HONEYCOMB_API_KEY=your_api_key (for single environment)\n` +
        `- HONEYCOMB_ENV_PROD_API_KEY=your_prod_api_key (for multiple environments)\n` +
        `- HONEYCOMB_ENV_STAGING_API_KEY=your_staging_api_key\n` +
        `- HONEYCOMB_API_ENDPOINT=https://api.honeycomb.io (optional, to override default)`
      );
    }
    throw error;
  }
}
