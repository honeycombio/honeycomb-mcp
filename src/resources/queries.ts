import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HoneycombAPI } from "../api/client.js";
import { AnalysisQuery } from "../types/query.js";

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
 * Creates and returns the queries resource template for interacting with Honeycomb queries.
 * This resource template allows users to view queries within datasets.
 * 
 * @param api - The Honeycomb API client instance
 * @returns A ResourceTemplate for queries
 */
export function createQueriesResource(api: HoneycombAPI) {
  return new ResourceTemplate("honeycomb://{environment}/{dataset}/queries/{queryId}", {
    /**
     * Lists all datasets and indicates they have queryable resources
     * 
     * @returns A list of dataset resources that contain queries
     */
    list: async () => {
      // Get all available environments
      const environments = api.getEnvironments();
      const resources: ResourceItem[] = [];
      
      // Fetch datasets from each environment
      for (const env of environments) {
        try {
          const datasets = await api.listDatasets(env);
          
          // Add each dataset as a resource with a queries indicator
          datasets.forEach((dataset) => {
            resources.push({
              uri: `honeycomb://${env}/${dataset.slug}/queries`,
              name: `${dataset.name} Queries`,
              description: `Queries for ${dataset.name}`,
            });
          });
        } catch (error) {
          // Error fetching datasets
        }
      }
      
      return { resources };
    }
  });
}

/**
 * Handles requests for query resources.
 * This function helps access query information.
 * 
 * @param api - The Honeycomb API client
 * @param variables - The parsed variables from the URI template
 * @returns Query resource contents
 * @throws Error if the query cannot be retrieved
 */
export async function handleQueryResource(
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
  
  const queryId = Array.isArray(variables.queryId)
    ? variables.queryId[0]
    : variables.queryId;
  
  if (!environment) {
    throw new Error("Missing environment parameter");
  }
  
  if (!datasetSlug) {
    throw new Error("Missing dataset parameter");
  }
  
  if (!queryId) {
    // The user is requesting all queries for this dataset
    // Note: The Honeycomb API doesn't have a direct endpoint to list all saved queries
    // We'll return a placeholder response indicating that query listing isn't available
    return {
      contents: [{
        uri: `honeycomb://${environment}/${datasetSlug}/queries`,
        text: JSON.stringify({
          message: "Listing of saved queries is not currently supported by the Honeycomb API. Please use the run-query tool to execute queries directly."
        }, null, 2),
        mimeType: "application/json"
      }]
    };
  } else {
    // Fetch the specific query by ID
    try {
      const queryData = await api.getQuery(environment, datasetSlug, queryId);
      
      return {
        contents: [{
          uri: `honeycomb://${environment}/${datasetSlug}/queries/${queryId}`,
          text: JSON.stringify({
            id: queryData.id,
            dataset: datasetSlug,
            query: queryData.query,
            execution_hint: `Use run-query tool with this query_id (${queryId}) to execute this query.`
          }, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      return {
        contents: [{
          uri: `honeycomb://${environment}/${datasetSlug}/queries/${queryId}`,
          text: JSON.stringify({
            error: `Failed to fetch query: ${error instanceof Error ? error.message : String(error)}`,
            note: "Make sure the query ID is valid and you have permission to access it."
          }, null, 2),
          mimeType: "application/json"
        }]
      };
    }
  }
}