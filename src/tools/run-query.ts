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
    description: `Executes a Honeycomb query, returning results with statistical summaries. 

CRITICAL RULE: For COUNT operations, NEVER include a "column" field in your calculation, even as null or undefined. Example: Use {"op": "COUNT"} NOT {"op": "COUNT", "column": "anything"}.

Additional Rules:
1) All parameters must be at the TOP LEVEL (not nested inside a 'query' property)
2) Field names must be exact - use 'op' (not 'operation'), 'breakdowns' (not 'group_by')
3) Only use the exact operation names listed in the schema (e.g., use "P95" for 95th percentile, not "PERCENTILE")
4) For all operations EXCEPT COUNT and CONCURRENCY, you must specify a "column" field
`,
    schema: {
      environment: z.string().min(1).trim().describe("The Honeycomb environment to query"),
      dataset: z.string().min(1).trim().describe("The dataset to query. Use __all__ to query across all datasets in the environment."),
      calculations: z.array(z.object({
        op: z.enum([
          "COUNT",               
          "CONCURRENCY",         
          "SUM",                 
          "AVG",                 
          "COUNT_DISTINCT",      
          "MAX",                 
          "MIN",                 
          "P001",                
          "P01",                 
          "P05",                 
          "P10",                 
          "P20",                 
          "P25",                 
          "P50",                 
          "P75",                 
          "P80",                 
          "P90",                 
          "P95",                 
          "P99",                 
          "P999",                
          "RATE_AVG",            
          "RATE_SUM",            
          "RATE_MAX",            
          "HEATMAP",             
        ]).describe(`⚠️⚠️⚠️ CRITICAL RULES FOR OPERATIONS:

1. FOR COUNT OPERATIONS:
   - NEVER include a "column" field
   - CORRECT: {"op": "COUNT"}
   - INCORRECT: {"op": "COUNT", "column": "anything"} 
   
2. FOR PERCENTILES:
   - Use the exact P* operations (P95, P99, etc.)
   - CORRECT: {"op": "P95", "column": "duration_ms"}
   - INCORRECT: {"op": "PERCENTILE", "percentile": 95}
   
3. ALL operations EXCEPT COUNT and CONCURRENCY REQUIRE a column field

COMMON ERRORS TO AVOID:
- DO NOT include "column" with COUNT or CONCURRENCY
- DO NOT use "PERCENTILE" - use "P95", "P99", etc. instead
- DO NOT misspell operation names`),
        column: z.string().min(1).trim().optional().describe("⚠️ CRITICAL: NEVER include this field when op is COUNT or CONCURRENCY. REQUIRED for all other operations."),
      }).superRefine((calculation, ctx) => {
        // Prevent column for COUNT or CONCURRENCY
        if ((calculation.op === "COUNT" || calculation.op === "CONCURRENCY") && calculation.column !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `ERROR: ${calculation.op} operations MUST NOT have a column field. Remove the "column" field entirely.`,
            path: ["column"]
          });
        }
        
        // Require column for all other operations
        if (!(calculation.op === "COUNT" || calculation.op === "CONCURRENCY") && calculation.column === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `ERROR: ${calculation.op} operations REQUIRE a column field.`,
            path: ["column"]
          });
        }
      })).describe("⚠️ CRITICAL RULE: For COUNT or CONCURRENCY operations, you MUST OMIT the 'column' field COMPLETELY - do not include it at all. For all other operations, the 'column' field is REQUIRED."),
      breakdowns: z.array(z.string().min(1).trim()).optional().describe("MUST use field name 'breakdowns' (not 'group_by'). Columns to group results by."),
      filters: z.array(z.object({
        column: z.string().min(1).trim().describe("MUST use field name 'column'. Name of the column to filter on."),
        op: z.enum([
          "=", "!=", ">", ">=", "<", "<=", 
          "starts-with", "does-not-start-with", 
          "ends-with", "does-not-end-with",
          "exists", "does-not-exist", 
          "contains", "does-not-contain",
          "in", "not-in"
        ]).describe(`MUST use field name 'op'. Available operators:
- Equality: "=", "!="
- Comparison: ">", ">=", "<", "<="
- String: "starts-with", "does-not-start-with", "ends-with", "does-not-end-with", "contains", "does-not-contain"
- Existence: "exists", "does-not-exist"
- Arrays: "in", "not-in" (use with array values)`),
        value: z.any().optional().describe("MUST use field name 'value'. Comparison value. Optional for exists operators. Use arrays for in/not-in.")
      })).optional().describe("MUST use field name 'filters' (an array of filter objects). Pre-calculation filters for the query."),
      filter_combination: z.enum(["AND", "OR"]).optional().describe("MUST use field name 'filter_combination' (not 'combine_filters'). How to combine filters: AND or OR. Default: AND."),
      orders: z.array(z.object({
        column: z.string().min(1).trim().describe("MUST use field name 'column'. Column to order by. Required when sorting by a column directly."),
        op: z.string().optional().describe("MUST use field name 'op' when provided. Operation to order by. Must match a calculation operation."),
        order: z.enum(["ascending", "descending"]).optional().describe("MUST use field name 'order' when provided. Available values: \"ascending\" (low to high) or \"descending\" (high to low).")
      })).optional().describe("MUST use field name 'orders' (not 'sort' or 'order_by'). Array of sort configurations."),
      limit: z.number().int().positive().optional().describe("MUST use field name 'limit'. Maximum number of result rows to return."),
      time_range: z.number().positive().optional().describe("MUST use field name 'time_range' (with underscore). Relative time range in seconds from now."),
      start_time: z.number().int().positive().optional().describe("MUST use field name 'start_time' (with underscore). Absolute start timestamp in seconds."),
      end_time: z.number().int().positive().optional().describe("MUST use field name 'end_time' (with underscore). Absolute end timestamp in seconds."),
      granularity: z.number().int().nonnegative().optional().describe("MUST use field name 'granularity'. Time resolution in seconds. 0 for auto."),
      havings: z.array(z.object({
        calculate_op: z.enum([
          "COUNT",               
          "CONCURRENCY",         
          "SUM",                 
          "AVG",                 
          "COUNT_DISTINCT",      
          "MAX",                 
          "MIN",                 
          "P001",                
          "P01",                 
          "P05",                 
          "P10",                 
          "P20",                 
          "P25",                 
          "P50",                 
          "P75",                 
          "P80",                 
          "P90",                 
          "P95",                 
          "P99",                 
          "P999",                
          "RATE_AVG",            
          "RATE_SUM",            
          "RATE_MAX"             
        ]).describe(`MUST use field name 'calculate_op'. Available operations:
- NO COLUMN ALLOWED: COUNT, CONCURRENCY
- REQUIRE COLUMN: SUM, AVG, COUNT_DISTINCT, MAX, MIN, P001, P01, P05, P10, P20, P25, P50, P75, P80, P90, P95, P99, P999, RATE_AVG, RATE_SUM, RATE_MAX`),
        column: z.string().min(1).trim().optional().describe("MUST use field name 'column'. NEVER use with COUNT/CONCURRENCY. REQUIRED for all other operations."),
        op: z.enum(["=", "!=", ">", ">=", "<", "<="]).describe("MUST use field name 'op'. Available comparison operators: \"=\", \"!=\", \">\", \">=\", \"<\", \"<=\""),
        value: z.number().describe("MUST use field name 'value'. Numeric threshold value to compare against.")
      })).optional().describe("MUST use field name 'havings'. Post-calculation filters with same column rules as calculations.")
    },
    /**
     * Handles the run_query tool request
     * 
     * @param params - The parameters for the query
     * @returns A formatted response with query results and summary statistics
     */
    handler: async (params: any) => {
      try {
        // Handle query object nesting - common mistake is to put params inside a 'query' property
        if (params.query && typeof params.query === 'object' && params.environment && params.dataset) {
          console.warn("Detected nested query object - pulling properties to top level");
          // Merge query properties into top level, but don't overwrite existing top-level properties
          for (const [key, value] of Object.entries(params.query)) {
            if (params[key] === undefined) {
              params[key] = value;
            }
          }
          
          // We've processed the query object, now delete it to avoid confusion
          delete params.query;
        }
        
        // Handle common field name mistakes
        if (params.group_by && !params.breakdowns) {
          params.breakdowns = params.group_by;
          delete params.group_by;
          console.warn("Detected 'group_by' field - renamed to 'breakdowns'");
        }
        
        // Handle order_by -> orders conversion
        if (params.order_by && !params.orders) {
          // Convert single order_by object to orders array
          if (!Array.isArray(params.order_by)) {
            params.orders = [params.order_by];
          } else {
            params.orders = params.order_by;
          }
          delete params.order_by;
          console.warn("Detected 'order_by' field - renamed to 'orders'");
        }
        
        // Handle having -> havings conversion
        if (params.having && !params.havings) {
          params.havings = params.having;
          delete params.having;
          console.warn("Detected 'having' field - renamed to 'havings'");
        }
        
        // Validate calculations array and field names
        if (params.calculations) {
          for (const calc of params.calculations) {
            // Handle operation -> op conversion if needed
            if (calc.operation && !calc.op) {
              calc.op = calc.operation;
              delete calc.operation;
              console.warn("Detected 'operation' field in calculation - renamed to 'op'");
            }
            
            // Handle field -> column conversion if needed
            if (calc.field && !calc.column) {
              calc.column = calc.field;
              delete calc.field;
              console.warn("Detected 'field' field in calculation - renamed to 'column'");
            }
            
            // We now rely on Zod schema refinements for validation of column rules
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