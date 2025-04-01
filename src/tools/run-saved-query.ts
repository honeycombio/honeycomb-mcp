import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { RunSavedQuerySchema } from "../types/schema.js";
import { summarizeResults } from "../utils/transformations.js";
import { QueryResult } from "../types/query.js";

/**
 * Tool to run a saved query by ID and wait for results
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createRunSavedQueryTool(api: HoneycombAPI) {
  return {
    name: "run_saved_query",
    description: "Runs a saved query by ID and returns the results, waiting for query completion. Use this tool to run queries saved in Honeycomb or queries from boards.",
    schema: RunSavedQuerySchema.shape,
    /**
     * Handler for the run_saved_query tool
     * 
     * @param params - The parameters for the tool
     * @returns Query results
     */
    handler: async ({ 
      environment, 
      dataset, 
      queryId, 
      includeSeries = false,
      maxAttempts = 10
    }: z.infer<typeof RunSavedQuerySchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "run_saved_query");
      }
      if (!dataset) {
        return handleToolError(new Error("dataset parameter is required"), "run_saved_query");
      }
      if (!queryId) {
        return handleToolError(new Error("queryId parameter is required"), "run_saved_query");
      }

      try {
        // Special handling for the __all__ dataset placeholder
        if (dataset === '__all__') {
          // Try to find the dataset that contains this query
          try {
            const datasets = await api.listDatasets(environment);
            
            // Try each dataset until we find the query
            for (const datasetInfo of datasets) {
              try {
                // Try to get the query definition to verify it exists
                await api.getQuery(environment, datasetInfo.slug, queryId);
                
                // If we get here, we found the query - use this dataset for execution
                dataset = datasetInfo.slug;
                break;
              } catch (error) {
                // If we get an error, just try the next dataset
                continue;
              }
            }
            
            // If dataset is still __all__, we couldn't find the query
            if (dataset === '__all__') {
              return handleToolError(
                new Error(`Could not find query with ID "${queryId}" in any available dataset`), 
                "run_saved_query"
              );
            }
          } catch (error) {
            return handleToolError(
              new Error(`Error searching for query: ${error instanceof Error ? error.message : String(error)}`),
              "run_saved_query"
            );
          }
        }

        // Step 1: Create a query result from the saved query ID
        const queryResult = await api.createQueryResult(environment, dataset, queryId);
        const queryResultId = queryResult.id;
        
        // Step 2: Poll for results until complete or max attempts reached
        let attempts = 0;
        let result: QueryResult | null = null;
        
        while (attempts < maxAttempts) {
          const results = await api.getQueryResults(environment, dataset, queryResultId, includeSeries);
          
          if (results.complete) {
            result = results;
            break;
          }
          
          attempts++;
          // Exponential backoff starting at 1 second
          const delay = Math.min(1000 * Math.pow(1.5, attempts - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        if (!result) {
          return handleToolError(
            new Error(`Query execution timed out after ${maxAttempts} attempts`),
            "run_saved_query"
          );
        }
        
        // Process the results
        try {
          // Simplify the response to reduce context window usage
          const simplifiedResponse = {
            results: result.data?.results || [],
            // Only include series data if explicitly requested (it's usually large)
            ...(includeSeries ? { series: result.data?.series || [] } : {}),
            
            // Include a query URL if available 
            query_url: result.links?.query_url || null,
            
            // Add summary statistics for numeric columns
            summary: summarizeResults(result.data?.results || [], {}),
            
            // Add query metadata for context
            metadata: {
              environment,
              dataset,
              queryId,
              executedAt: new Date().toISOString(),
              resultCount: result.data?.results?.length || 0
            }
          };
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(simplifiedResponse, null, 2),
              },
            ],
          };
        } catch (processingError) {
          // Handle result processing errors separately to still return partial results
          console.error("Error processing query results:", processingError);
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  results: result.data?.results || [],
                  query_url: result.links?.query_url || null,
                  error: `Error processing results: ${processingError instanceof Error ? processingError.message : String(processingError)}`
                }, null, 2),
              },
            ],
          };
        }
      } catch (error) {
        return handleToolError(error, "run_saved_query");
      }
    }
  };
}