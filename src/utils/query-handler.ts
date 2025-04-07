/**
 * Shared utilities for handling queries across different tools
 */
import { summarizeResults } from "./transformations.js";
import { ToolResponseContent } from "./tool-factory.js";

/**
 * Helper function to execute a query and process the results
 * 
 * This centralizes query execution logic that is duplicated across
 * multiple query-based tools.
 * 
 * @param result - The query result from the API
 * @param params - The query parameters
 * @param hasHeatmap - Whether the query contains a heatmap calculation
 * @returns Formatted query results with summary statistics
 */
export function formatQueryResults(
  result: any,
  params: any,
  hasHeatmap: boolean = false
): ToolResponseContent {
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
 * Helper function to execute queries with retry logic
 * 
 * @param executeFunc - The function to execute the query
 * @param maxRetries - The maximum number of retries
 * @returns The result of the successful query execution
 * @throws The last error if all retries fail
 */
export async function executeWithRetry<T>(
  executeFunc: () => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: unknown = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await executeFunc();
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      
      // Only retry if not the last attempt
      if (attempt < maxRetries) {
        console.error(`Retrying in ${attempt * 500}ms...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }
  
  // If we get here, all attempts failed
  throw lastError || new Error("All query attempts failed");
}