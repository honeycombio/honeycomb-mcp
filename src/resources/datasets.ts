import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HoneycombAPI } from "../api/client.js";
import { Dataset } from "../types/api.js";

/**
 * Creates and returns the datasets resource template
 */
export function createDatasetsResource(api: HoneycombAPI) {
  return new ResourceTemplate("honeycomb://{environment}/{dataset}", { 
    list: async () => {
      const environments = api.getEnvironments();
      const resources: { uri: string; name: string; description?: string }[] = [];
      
      for (const env of environments) {
        try {
          const datasets = await api.listDatasets(env);
          datasets.forEach((dataset: Dataset) => {
            resources.push({
              uri: `honeycomb://${env}/${dataset.slug}`,
              name: dataset.name,
              description: dataset.description || `Dataset ${dataset.name} in environment ${env}`,
            });
          });
        } catch (error) {
          console.error(`Error listing datasets for environment ${env}:`, error);
        }
      }

      return { resources };
    }
  });
}

/**
 * Handler for dataset resource retrieval
 */
export async function handleDatasetResource(api: HoneycombAPI, uri: URL, { environment, dataset }: { environment: string; dataset: string }) {
  try {
    if (dataset) {
      // Get specific dataset
      const datasetInfo = await api.getDataset(environment, dataset);
      const columns = await api.getVisibleColumns(environment, dataset);

      // Create a streamlined version of dataset info
      const datasetWithColumns = {
        name: datasetInfo.name,
        description: datasetInfo.description || '',
        slug: datasetInfo.slug,
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
    } else {
      // List all datasets with simplified info
      const datasets = await api.listDatasets(environment);
      return {
        contents: datasets.map((dataset: Dataset) => ({
          uri: `honeycomb://${environment}/${dataset.slug}`,
          text: JSON.stringify({
            name: dataset.name,
            slug: dataset.slug,
            description: dataset.description || '',
          }, null, 2),
        })),
      };
    }
  } catch (error) {
    throw new Error(`Failed to read dataset: ${error}`);
  }
}
