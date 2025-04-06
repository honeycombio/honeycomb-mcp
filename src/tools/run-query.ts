import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { QueryToolSchema } from "../types/schema.js";
import { summarizeResults } from "../utils/transformations.js";
import { validateQuery } from "../query/validation.js";

/**
 * Helper function to execute a query and process the results
 */
async function executeQuery(
  api: HoneycombAPI, 
  params: z.infer<typeof QueryToolSchema>,
  hasHeatmap: boolean
) {
  // Execute the query
  const result = await api.runAnalysisQuery(params.environment, params.dataset, params);
  
  try {
    // Simplify the response to reduce context window usage
    const simplifiedResponse = {
      results: result.data?.results || [],
      // Only include series data if heatmap calculation is present (it's usually large)
      ...(hasHeatmap ? { series: result.data?.series || [] } : {}),
      
      // Include a query URL if available 
      query_url: result.links?.query_url || null,
      
      // Add summary statistics for numeric columns
      summary: summarizeResults(result.data?.results || [], params),
      
      // Add query metadata for context
      metadata: {
        environment: params.environment,
        dataset: params.dataset,
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
}

/**
 * Creates a tool for running queries against a Honeycomb dataset or environment.
 * 
 * This tool handles construction, validation, execution, and summarization of
 * Honeycomb queries, returning both raw results and useful statistical summaries.
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createRunQueryTool(api: HoneycombAPI) {
  return {
    name: "run_query",
    description: `Executes a Honeycomb query against a dataset or environment, performing validation and returning raw results along with statistical summaries. This tool handles construction, validation, execution, and summarization of Honeycomb queries. NOTE: use __all__ as a dataset name to run a query against an environment.`,
    schema: QueryToolSchema,
    /**
     * Handles the run_query tool request
     * 
     * @param params - The parameters for the query
     * @returns A formatted response with query results and summary statistics
     */
    handler: async (params: z.infer<typeof QueryToolSchema>) => {
      try {
        // Validate parameters
        validateQuery(params);
        
        // Check if any calculations use HEATMAP
        const hasHeatmap = params.calculations.some(calc => calc.op === "HEATMAP");
        
        // Execute the query with retry logic for transient API issues
        const maxRetries = 3;
        let lastError: unknown = null;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await executeQuery(api, params, hasHeatmap);
          } catch (error) {
            lastError = error;
            console.error(`Query attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
            
            // Only retry if not the last attempt
            if (attempt < maxRetries) {
              console.error(`Retrying in ${attempt * 500}ms...`);
              await new Promise(resolve => setTimeout(resolve, attempt * 500));
            }
          }
        }
        
        // If we get here, all attempts failed
        throw lastError || new Error("All query attempts failed");
      } catch (error) {
        return handleToolError(error, "run_query", {
          environment: params.environment,
          dataset: params.dataset
        });
      }
    },
  };
}