import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HoneycombAPI } from "../api/client.js";
import { Dataset } from "../types/api.js";

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
 * Creates and returns the datasets resource template for interacting with Honeycomb datasets
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
 * Handles requests for dataset resources
 * 
 * This function retrieves either a specific dataset with its columns or
 * a list of all datasets in an environment.
 * 
 * @param api - The Honeycomb API client
 * @param uri - The resource URI
 * @param params - The parsed parameters from the URI
 * @returns Dataset resource contents
 * @throws Error if the dataset cannot be retrieved
 */
export async function handleDatasetResource(
  api: HoneycombAPI, 
  uri: URL, 
  { environment, dataset }: { environment: string; dataset: string }
) {
  try {
    // Validate required parameters
    if (!environment) {
      throw new Error("Missing required parameter: environment");
    }

    if (dataset) {
      // Get specific dataset with columns
      try {
        // Fetch dataset info and columns in parallel
        const [datasetInfo, columns] = await Promise.all([
          api.getDataset(environment, dataset),
          api.getVisibleColumns(environment, dataset)
        ]);

        // Create a streamlined version of dataset info
        const datasetWithColumns: DatasetWithColumns = {
          name: datasetInfo.name,
          description: datasetInfo.description || '',
          slug: datasetInfo.slug,
          created_at: datasetInfo.created_at,
          last_written_at: datasetInfo.last_written_at,
          columns: columns
            .filter(c => !c.hidden) // Only show visible columns
            .map((c) => ({
              name: c.key_name,
              type: c.type,
              description: c.description || '',
            }))
            .sort((a, b) => a.name.localeCompare(b.name)), // Sort by column name
        };

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(datasetWithColumns, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to retrieve dataset '${dataset}': ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      // List all datasets in the environment
      try {
        const datasets = await api.listDatasets(environment);
        
        if (datasets.length === 0) {
          // Return empty contents instead of throwing
          return { contents: [] };
        }
        
        return {
          contents: datasets.map((dataset: Dataset) => ({
            uri: `honeycomb://${environment}/${dataset.slug}`,
            text: JSON.stringify({
              name: dataset.name,
              slug: dataset.slug,
              description: dataset.description || '',
              created_at: dataset.created_at,
              last_written_at: dataset.last_written_at,
            }, null, 2),
          })),
        };
      } catch (error) {
        throw new Error(`Failed to list datasets in environment '${environment}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    // Wrap and re-throw any errors with context
    throw new Error(`Failed to read dataset: ${error instanceof Error ? error.message : String(error)}`);
  }
}
