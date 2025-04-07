/**
 * Base schema components that are reused across different schema types
 */
import { z } from "zod";

/**
 * Schema for pagination, filtering, and sorting options
 */
export const PaginationSchema = z.object({
  page: z.number().positive().int().optional().describe("Page number (1-based)"),
  limit: z.number().positive().int().optional().describe("Number of items per page"),
  sort_by: z.string().optional().describe("Field to sort by"),
  sort_order: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
  search: z.string().trim().optional().describe("Search term to filter results"),
  search_fields: z.union([
    z.string(),
    z.array(z.string().min(1))
  ]).optional().describe("Fields to search in (string or array of strings)"),
});

/**
 * Base schema for most API operations requiring an environment
 */
export const BaseEnvSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
});

/**
 * Base schema for all list operations that only require an environment
 */
export const BaseListSchema = BaseEnvSchema.merge(PaginationSchema);

/**
 * Base schema for operations requiring both environment and dataset
 */
export const BaseDatasetSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset to use"),
}).merge(PaginationSchema);

/**
 * Filter operators for Honeycomb queries
 */
export const FilterOperatorSchema = z.enum([
  "=",
  "\!=",
  ">",
  ">=",
  "<",
  "<=",
  "starts-with",
  "does-not-start-with",
  "ends-with",
  "does-not-end-with",
  "exists",
  "does-not-exist",
  "contains",
  "does-not-contain",
  "in",
  "not-in",
]).describe(`Available filter operators:
- Equality: "=", "!="
- Comparison: ">", ">=", "<", "<="
- String: "starts-with", "does-not-start-with", "ends-with", "does-not-end-with", "contains", "does-not-contain"
- Existence: "exists", "does-not-exist"
- Arrays: "in", "not-in" (use with array values)`);

/**
 * Schema for query filters
 */
export const FilterSchema = z.object({
  column: z.string().min(1).trim().describe("Column name to filter on"),
  op: FilterOperatorSchema,
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.array(z.number()),
    ])
    .optional()
    .describe("Comparison value. Optional for exists/does-not-exist operators. Use arrays for in/not-in operators."),
}).describe("Pre-calculation filter. Restricts which events are included before aggregation.");

/**
 * Sort directions for query results
 */
export const OrderDirectionSchema = z.enum(["ascending", "descending"])
  .describe("Available sort directions: \"ascending\" (low to high) or \"descending\" (high to low)");

/**
 * Schema for ordering query results
 */
export const OrderSchema = z.object({
  column: z.string().min(1).trim().describe("Column to order by. Required field. Can reference a column in breakdowns or be used with op for calculations."),
  op: z.string().optional().describe("Operation to order by. When provided, must match a calculation operation (except HEATMAP)."),
  order: OrderDirectionSchema.optional().describe("Sort direction. Default is \"ascending\" if not specified."),
}).describe("Result ordering configuration. Must reference columns in breakdowns or calculations. Examples: {\"column\": \"user_id\"} or {\"column\": \"duration_ms\", \"op\": \"P99\", \"order\": \"descending\"}");

/**
 * Available calculation operations for queries
 */
export const CalculationOpSchema = z.enum([
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
]).describe(`Available operations:
- NO COLUMN ALLOWED: COUNT (count of events), CONCURRENCY (concurrent operations)
- REQUIRE COLUMN: SUM, AVG, COUNT_DISTINCT, MAX, MIN, P001, P01, P05, P10, P20, P25, P50, P75, P80, P90, P95, P99, P999, RATE_AVG, RATE_SUM, RATE_MAX, HEATMAP`);

/**
 * Schema for query calculations
 */
export const QueryCalculationSchema = z.object({
  op: CalculationOpSchema,
  column: z.string().min(1).trim().optional().describe("Column to perform calculation on. REQUIRED for all operations EXCEPT COUNT and CONCURRENCY. Do not include for COUNT or CONCURRENCY."),
}).describe("Calculation to perform. Column rule: never use column with COUNT/CONCURRENCY; required for all other operations.");

/**
 * Available calculation operations for having clauses (excludes HEATMAP)
 */
export const HavingOpSchema = z.enum([
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
]).describe(`Available operations for having clause:
- NO COLUMN ALLOWED: COUNT (count of events), CONCURRENCY (concurrent operations)
- REQUIRE COLUMN: SUM, AVG, COUNT_DISTINCT, MAX, MIN, P001, P01, P05, P10, P20, P25, P50, P75, P80, P90, P95, P99, P999, RATE_AVG, RATE_SUM, RATE_MAX`);

/**
 * Schema for having clauses in queries
 */
export const HavingSchema = z.object({
  calculate_op: HavingOpSchema,
  column: z.string().min(1).trim().optional().describe("Column to filter on. REQUIRED for all operations EXCEPT COUNT and CONCURRENCY. Do not include for COUNT or CONCURRENCY."),
  op: z.enum(["=", "\!=", ">", ">=", "<", "<="]).describe("Available comparison operators: \"=\", \"!=\", \">\", \">=\", \"<\", \"<=\""),
  value: z.number().describe("Numeric threshold value to compare against"),
}).describe("Post-calculation filter. Column rule: never use column with COUNT/CONCURRENCY; required for all other operations.");

/**
 * Schema for time validation in queries
 */
export const TimeValidationSchema = {
  refine: (data: any) => {
    // Ensure we're not providing both time_range and start_time+end_time
    const hasTimeRange = data.time_range !== undefined;
    const hasStartTime = data.start_time !== undefined;
    const hasEndTime = data.end_time !== undefined;
    
    if (hasTimeRange && hasStartTime && hasEndTime) {
      return false;
    }
    
    // If both start_time and end_time are provided, ensure end_time > start_time
    if (hasStartTime && hasEndTime && data.start_time && data.end_time) {
      return data.end_time > data.start_time;
    }
    
    return true;
  },
  message: "Invalid time parameters: either use time_range alone, or start_time and end_time together, or time_range with either start_time or end_time",
  path: ["time_range", "start_time", "end_time"]
};