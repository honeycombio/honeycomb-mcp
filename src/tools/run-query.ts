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
    description: `⚠️⚠️⚠️ IMPORTANT: 'COUNT' and 'CONCURRENCY' operations MUST NOT have a 'column' specified. All other operations REQUIRE a 'column'. ⚠️⚠️⚠️ Executes a Honeycomb query against a dataset or environment, performing validation and returning raw results along with statistical summaries. NOTE: use __all__ as a dataset name to run a query against an environment.`,
    schema: {
      environment: z.string().min(1).trim().describe("The Honeycomb environment to query"),
      dataset: z.string().min(1).trim().describe("The dataset to query. Use __all__ to query across all datasets in the environment."),
      calculations: z.array(z.object({
        op: z.enum([
          "COUNT",                // ⚠️ NO COLUMN ALLOWED - counts all events
          "CONCURRENCY",          // ⚠️ NO COLUMN ALLOWED - measures concurrent operations
          "SUM",                  // ✓ REQUIRES COLUMN - sums values in column
          "AVG",                  // ✓ REQUIRES COLUMN - averages values in column
          "COUNT_DISTINCT",       // ✓ REQUIRES COLUMN - counts unique values
          "MAX",                  // ✓ REQUIRES COLUMN - maximum value in column
          "MIN",                  // ✓ REQUIRES COLUMN - minimum value in column
          "P001",                 // ✓ REQUIRES COLUMN - 0.1th percentile
          "P01",                  // ✓ REQUIRES COLUMN - 1st percentile
          "P05",                  // ✓ REQUIRES COLUMN - 5th percentile
          "P10",                  // ✓ REQUIRES COLUMN - 10th percentile
          "P20",                  // ✓ REQUIRES COLUMN - 20th percentile
          "P25",                  // ✓ REQUIRES COLUMN - 25th percentile (first quartile)
          "P50",                  // ✓ REQUIRES COLUMN - 50th percentile (median)
          "P75",                  // ✓ REQUIRES COLUMN - 75th percentile (third quartile)
          "P80",                  // ✓ REQUIRES COLUMN - 80th percentile
          "P90",                  // ✓ REQUIRES COLUMN - 90th percentile
          "P95",                  // ✓ REQUIRES COLUMN - 95th percentile
          "P99",                  // ✓ REQUIRES COLUMN - 99th percentile
          "P999",                 // ✓ REQUIRES COLUMN - 99.9th percentile
          "RATE_AVG",             // ✓ REQUIRES COLUMN - rate of change in average
          "RATE_SUM",             // ✓ REQUIRES COLUMN - rate of change in sum
          "RATE_MAX",             // ✓ REQUIRES COLUMN - rate of change in maximum
          "HEATMAP",              // ✓ REQUIRES COLUMN - heat map visualization
        ]).describe("⚠️⚠️⚠️ CALCULATION RULES: 'COUNT' and 'CONCURRENCY' operations CANNOT have a column. All other operations MUST have a column."),
        column: z.string().min(1).trim().optional().describe("⚠️⚠️⚠️ COLUMN RULES: 1) NEVER provide a column for COUNT or CONCURRENCY, 2) ALWAYS provide a column for ALL other operations."),
      })).describe("⚠️⚠️⚠️ List of calculations to perform. CRITICAL RULE: For 'COUNT' or 'CONCURRENCY', DO NOT include a column. For all other operations, a column IS REQUIRED."),
      breakdowns: z.array(z.string().min(1).trim()).optional().describe("Columns to group results by. Creates separate results for each unique combination of values in these columns."),
      filters: z.array(z.object({
        column: z.string().min(1).trim().describe("The name of the column to filter on"),
        op: z.enum([
          "=", "!=", ">", ">=", "<", "<=", 
          "starts-with", "does-not-start-with", 
          "ends-with", "does-not-end-with",
          "exists", "does-not-exist", 
          "contains", "does-not-contain",
          "in", "not-in"
        ]).describe("Filter operator for comparing column values"),
        value: z.any().optional().describe("The value to compare against. Optional for exists/does-not-exist operators.")
      })).optional().describe("Pre-calculation filters to apply to the data. Restricts which events are included in the analysis."),
      filter_combination: z.enum(["AND", "OR"]).optional().describe("How to combine multiple filters. AND requires all filters to match; OR requires any filter to match. Default is AND."),
      orders: z.array(z.object({
        column: z.string().min(1).trim().optional().describe("The column to order by. Optional for COUNT and CONCURRENCY operations"),
        op: z.string().describe("The operation to order by. Must be one of the calculation operations except HEATMAP"),
        order: z.enum(["ascending", "descending"]).describe("Sort direction for the query results")
      })).optional().describe("How to sort the results. Can only reference columns in breakdowns or operations in calculations."),
      limit: z.number().int().positive().optional().describe("Maximum number of result rows to return"),
      time_range: z.number().positive().optional().describe("Relative time range in seconds from now. E.g., 3600 for the last hour."),
      start_time: z.number().int().positive().optional().describe("Absolute start time as UNIX timestamp in seconds"),
      end_time: z.number().int().positive().optional().describe("Absolute end time as UNIX timestamp in seconds"),
      granularity: z.number().int().nonnegative().optional().describe("Time resolution in seconds for time series results. Use 0 for auto or omit."),
      having: z.array(z.object({
        calculate_op: z.enum([
          "COUNT",                // ⚠️ NO COLUMN ALLOWED
          "CONCURRENCY",          // ⚠️ NO COLUMN ALLOWED
          "SUM",                  // ✓ REQUIRES COLUMN
          "AVG",                  // ✓ REQUIRES COLUMN
          "COUNT_DISTINCT",       // ✓ REQUIRES COLUMN
          "MAX",                  // ✓ REQUIRES COLUMN
          "MIN",                  // ✓ REQUIRES COLUMN
          "P001",                 // ✓ REQUIRES COLUMN
          "P01",                  // ✓ REQUIRES COLUMN
          "P05",                  // ✓ REQUIRES COLUMN
          "P10",                  // ✓ REQUIRES COLUMN
          "P20",                  // ✓ REQUIRES COLUMN
          "P25",                  // ✓ REQUIRES COLUMN
          "P50",                  // ✓ REQUIRES COLUMN
          "P75",                  // ✓ REQUIRES COLUMN
          "P80",                  // ✓ REQUIRES COLUMN
          "P90",                  // ✓ REQUIRES COLUMN
          "P95",                  // ✓ REQUIRES COLUMN
          "P99",                  // ✓ REQUIRES COLUMN
          "P999",                 // ✓ REQUIRES COLUMN
          "RATE_AVG",             // ✓ REQUIRES COLUMN
          "RATE_SUM",             // ✓ REQUIRES COLUMN
          "RATE_MAX"              // ✓ REQUIRES COLUMN
        ]).describe("⚠️⚠️⚠️ HAVING RULES: 'COUNT' and 'CONCURRENCY' CANNOT have a column. All other operations MUST have a column."),
        column: z.string().min(1).trim().optional().describe("⚠️⚠️⚠️ COLUMN RULES: 1) NEVER provide a column for COUNT or CONCURRENCY, 2) ALWAYS provide a column for ALL other operations."),
        op: z.enum(["=", "!=", ">", ">=", "<", "<="]).describe("Comparison operator for the having clause"),
        value: z.number().describe("Numeric threshold value to compare against")
      })).optional().describe("Post-calculation filters to apply to results. Used to filter based on calculation outcomes.")
    },
    /**
     * Handles the run_query tool request
     * 
     * @param params - The parameters for the query
     * @returns A formatted response with query results and summary statistics
     */
    handler: async (params: any) => {
      try {
        // Validate COUNT operations don't have columns and others do
        if (params.calculations) {
          for (const calc of params.calculations) {
            if ((calc.op === "COUNT" || calc.op === "CONCURRENCY") && calc.column) {
              throw new Error(`Error: ${calc.op} operation MUST NOT have a column specified. Remove the column attribute.`);
            }
            if (!(calc.op === "COUNT" || calc.op === "CONCURRENCY") && !calc.column) {
              throw new Error(`Error: ${calc.op} operation REQUIRES a column to be specified.`);
            }
          }
        }
        
        // Validate parameters with our standard validation
        validateQuery(params);
        
        // Check if any calculations use HEATMAP
        const hasHeatmap = params.calculations.some((calc: any) => calc.op === "HEATMAP");
        
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