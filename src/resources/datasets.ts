import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HoneycombAPI } from "../api/client.js";
import { Dataset } from "../types/api.js";
import { Column } from "../types/column.js";

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
 * Creates and returns the datasets resource template for interacting with Honeycomb datasets. This resource template allows users to list all datasets across all environments and retrieve specific datasets with their columns.
 * 
 * @param api - The Honeycomb API client instance
 * @returns A ResourceTemplate for datasets
 */
export function createDatasetsResource(api: HoneycombAPI) {
  return new ResourceTemplate("honeycomb://{environment}/{dataset}", { 
    /**
     * Lists all datasets across all environments
     * 
     * @returns A list of dataset resources across all environments
     */
    list: async () => {
      // Get all available environments
      const environments = api.getEnvironments();
      const resources: ResourceItem[] = [];
      
      // Fetch datasets from each environment
      for (const env of environments) {
        try {
          const datasets = await api.listDatasets(env);
          
          // Add each dataset as a resource
          datasets.forEach((dataset: Dataset) => {
            resources.push({
              uri: `honeycomb://${env}/${dataset.slug}`,
              name: dataset.name,
              description: dataset.description || '',
            });
          });
        } catch (error) {
          console.error(`Error fetching datasets for environment ${env}:`, error);
        }
      }
      
      return { resources };
    }
  });
}

/**
 * Interface for dataset with column information
 */
interface DatasetWithColumns {
  name: string;
  description: string;
  slug: string;
  columns: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  created_at?: string;
  last_written_at?: string | null;
}

/**
 * Handles requests for dataset resources. This resource template allows users to list all datasets across all environments and retrieve specific datasets with their columns.
 * 
 * This function retrieves either a specific dataset with its columns or
 * a list of all datasets in an environment.
 * 
 * @param api - The Honeycomb API client
 * @param uri - The resource URI
 * @param variables - The parsed variables from the URI template
 * @returns Dataset resource contents
 * @throws Error if the dataset cannot be retrieved
 */
export async function handleDatasetResource(
  api: HoneycombAPI,
  variables: Record<string, string | string[]>
) {
  // Extract environment and dataset from variables, handling potential array values
  const environment = Array.isArray(variables.environment) 
    ? variables.environment[0] 
    : variables.environment;
    
  const datasetSlug = Array.isArray(variables.dataset) 
    ? variables.dataset[0] 
    : variables.dataset;
  
  if (!environment) {
    throw new Error("Missing environment parameter");
  }
  
  if (!datasetSlug) {
    // Return all datasets for this environment
    try {
      const datasets = await api.listDatasets(environment);
      
      return {
        contents: datasets.map(dataset => ({
          uri: `honeycomb://${environment}/${dataset.slug}`,
          text: JSON.stringify({
            name: dataset.name,
            description: dataset.description || '',
            slug: dataset.slug,
            created_at: dataset.created_at,
            last_written_at: dataset.last_written_at,
          }, null, 2),
          mimeType: "application/json"
        }))
      };
    } catch (error) {
      throw new Error(`Failed to list datasets: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Return specific dataset with columns
    try {
      const dataset = await api.getDataset(environment, datasetSlug);
      const columns = await api.getVisibleColumns(environment, datasetSlug);
      
      // Filter out hidden columns
      const visibleColumns = columns.filter((column: Column) => !column.hidden);
      
      const datasetWithColumns: DatasetWithColumns = {
        name: dataset.name,
        description: dataset.description || '',
        slug: dataset.slug,
        columns: visibleColumns.map((column: Column) => ({
          name: column.key_name,
          type: column.type,
          description: column.description || '',
        })),
        created_at: dataset.created_at,
        last_written_at: dataset.last_written_at,
      };
      
      return {
        contents: [{
          uri: `honeycomb://${environment}/${datasetSlug}`,
          text: JSON.stringify(datasetWithColumns, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      throw new Error(`Failed to read dataset: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
