import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HoneycombAPI } from "../api/client.js";
import { SLO, SLODetailedResponse } from "../types/slo.js";

/**
 * Interface for MCP resource items
 */
interface ResourceItem {
  uri: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Creates and returns the SLOs resource template for interacting with Honeycomb SLOs.
 * This resource template allows users to list all SLOs across all datasets and retrieve specific SLO details.
 * 
 * @param api - The Honeycomb API client instance
 * @returns A ResourceTemplate for SLOs
 */
export function createSLOsResource(api: HoneycombAPI) {
  return new ResourceTemplate("honeycomb://{environment}/{dataset}/slos/{sloId}", {
    /**
     * Lists all SLOs across all environments and datasets
     * 
     * @returns A list of SLO resources across all environments and datasets
     */
    list: async () => {
      // Get all available environments
      const environments = api.getEnvironments();
      const resources: ResourceItem[] = [];
      
      // Fetch datasets and SLOs from each environment
      for (const env of environments) {
        try {
          const datasets = await api.listDatasets(env);
          
          // Fetch SLOs for each dataset
          for (const dataset of datasets) {
            try {
              const slos = await api.getSLOs(env, dataset.slug);
              
              // Add each SLO as a resource
              slos.forEach((slo: SLO) => {
                resources.push({
                  uri: `honeycomb://${env}/${dataset.slug}/slos/${slo.id}`,
                  name: slo.name,
                  description: slo.description || `SLO in ${dataset.name}`,
                  target: slo.target_per_million / 10000, // Convert to percentage
                  time_period_days: slo.time_period_days,
                });
              });
            } catch (error) {
              // Error fetching SLOs
            }
          }
        } catch (error) {
          // Error fetching datasets
        }
      }
      
      return { resources };
    }
  });
}

/**
 * Handles requests for SLO resources.
 * This function retrieves either a specific SLO with its details or a list of SLOs for a dataset.
 * 
 * @param api - The Honeycomb API client
 * @param variables - The parsed variables from the URI template
 * @returns SLO resource contents
 * @throws Error if the SLO cannot be retrieved
 */
export async function handleSLOResource(
  api: HoneycombAPI,
  variables: Record<string, string | string[]>
) {
  // Extract environment, dataset, and sloId from variables, handling potential array values
  const environment = Array.isArray(variables.environment) 
    ? variables.environment[0] 
    : variables.environment;
    
  const datasetSlug = Array.isArray(variables.dataset) 
    ? variables.dataset[0] 
    : variables.dataset;
  
  const sloId = Array.isArray(variables.sloId)
    ? variables.sloId[0]
    : variables.sloId;
  
  if (!environment) {
    throw new Error("Missing environment parameter");
  }
  
  if (!datasetSlug) {
    throw new Error("Missing dataset parameter");
  }
  
  if (!sloId) {
    // Return all SLOs for this dataset
    try {
      const slos = await api.getSLOs(environment, datasetSlug);
      
      return {
        contents: slos.map(slo => ({
          uri: `honeycomb://${environment}/${datasetSlug}/slos/${slo.id}`,
          text: JSON.stringify({
            id: slo.id,
            name: slo.name,
            description: slo.description || '',
            sli: slo.sli,
            target_percentage: slo.target_per_million / 10000, // Convert to percentage
            time_period_days: slo.time_period_days,
            created_at: slo.created_at,
            updated_at: slo.updated_at,
          }, null, 2),
          mimeType: "application/json"
        }))
      };
    } catch (error) {
      throw new Error(`Failed to list SLOs: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Return specific SLO with detailed information
    try {
      const slo = await api.getSLO(environment, datasetSlug, sloId);
      
      return {
        contents: [{
          uri: `honeycomb://${environment}/${datasetSlug}/slos/${sloId}`,
          text: JSON.stringify({
            id: slo.id,
            name: slo.name,
            description: slo.description || '',
            sli: slo.sli,
            target_percentage: slo.target_per_million / 10000, // Convert to percentage
            time_period_days: slo.time_period_days,
            compliance: slo.compliance,
            budget_remaining: slo.budget_remaining,
            created_at: slo.created_at,
            updated_at: slo.updated_at,
            reset_at: slo.reset_at,
          }, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      throw new Error(`Failed to read SLO: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}