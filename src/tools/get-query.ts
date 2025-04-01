import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { GetQuerySchema } from "../types/schema.js";
import { AnalysisQuery } from "../types/query.js";

/**
 * Interface for simplified query data returned by the get_query tool
 */
interface SimplifiedQuery {
  id: string;
  dataset: string;
  query: AnalysisQuery;
  name?: string;
  description?: string;
}

/**
 * Tool to retrieve a specific query by ID from Honeycomb.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createGetQueryTool(api: HoneycombAPI) {
  return {
    name: "get_query",
    description: "Retrieves a specific query by ID from Honeycomb. Returns the query definition that can be used with the run-query tool.",
    schema: GetQuerySchema.shape,
    /**
     * Handler for the get_query tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @param params.dataset - The dataset containing the query
     * @param params.queryId - The ID of the query to retrieve
     * @returns The query definition for the specified ID
     */
    handler: async ({ environment, dataset, queryId }: z.infer<typeof GetQuerySchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "get_query");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "get_query");
      }
      if (!queryId) {
        return handleToolError(new Error("queryId parameter is required"), "get_query");
      }

      try {
        // Special handling for the __all__ dataset placeholder
        if (dataset === '__all__') {
          // Try to fetch the query without specifying a dataset
          // This will attempt to find the query in any dataset the user has access to
          try {
            const authInfo = await api.getAuthInfo(environment);
            const teamSlug = authInfo.team?.slug;
            
            if (!teamSlug) {
              return handleToolError(new Error("Could not determine team slug from environment"), "get_query");
            }
            
            // First try to get all datasets to search through
            const datasets = await api.listDatasets(environment);
            
            // Try each dataset until we find the query
            for (const datasetInfo of datasets) {
              try {
                // If we found the query in this dataset, also try to get its annotation
                const queryData = await api.getQuery(environment, datasetInfo.slug, queryId);
                const queryAnnotation = await api.getQueryAnnotation(environment, datasetInfo.slug, queryId);
                
                // If we get here, we found the query
                const simplifiedQuery: SimplifiedQuery = {
                  id: queryData.id,
                  dataset: datasetInfo.slug,
                  query: queryData.query,
                  // Add name and description from annotation if available
                  ...(queryAnnotation?.name && { name: queryAnnotation.name }),
                  ...(queryAnnotation?.description && { description: queryAnnotation.description }),
                };
                
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(simplifiedQuery, null, 2),
                    },
                  ],
                  metadata: {
                    queryId,
                    dataset: datasetInfo.slug,
                    environment,
                    note: "Found query in dataset: " + datasetInfo.slug
                  }
                };
              } catch (error) {
                // If we get an error, just try the next dataset
                continue;
              }
            }
            
            // If we get here, we couldn't find the query in any dataset
            return handleToolError(
              new Error(`Could not find query with ID "${queryId}" in any available dataset`), 
              "get_query"
            );
          } catch (error) {
            return handleToolError(
              new Error(`Error searching for query: ${error instanceof Error ? error.message : String(error)}`),
              "get_query"
            );
          }
        }
        
        // Normal case - fetch query details and annotation from the API
        const [queryData, queryAnnotation] = await Promise.all([
          api.getQuery(environment, dataset, queryId),
          api.getQueryAnnotation(environment, dataset, queryId)
        ]);
        
        // Simplify the response to reduce context window usage
        const simplifiedQuery: SimplifiedQuery = {
          id: queryData.id,
          dataset,
          query: queryData.query,
          // Add name and description from annotation if available
          ...(queryAnnotation?.name && { name: queryAnnotation.name }),
          ...(queryAnnotation?.description && { description: queryAnnotation.description }),
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedQuery, null, 2),
            },
          ],
          metadata: {
            queryId,
            dataset,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "get_query");
      }
    }
  };
}