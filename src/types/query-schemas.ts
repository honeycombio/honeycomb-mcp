/**
 * Schemas related to Honeycomb queries and data analysis
 */
import { z } from "zod";
import { 
  BaseEnvSchema, 
  BaseDatasetSchema,
  FilterSchema, 
  OrderSchema, 
  QueryCalculationSchema, 
  HavingSchema,
  TimeValidationSchema
} from "./base-schemas.js";

/**
 * Schema for running queries
 */
export const QueryToolSchema = z.object({
  environment: z.string().min(1).trim().describe("Honeycomb environment to query"),
  dataset: z.string().min(1).trim().describe("Dataset to query. Use __all__ for all datasets in the environment."),
  calculations: z.array(QueryCalculationSchema).optional().describe("List of calculations to perform. If omitted, COUNT is applied automatically."),
  breakdowns: z.array(z.string().min(1).trim()).optional().describe("Columns to group results by. Creates separate results for each unique value combination."),
  filters: z.array(FilterSchema).optional().describe("Pre-calculation filters to restrict which events are included."),
  filter_combination: z.enum(["AND", "OR"]).optional().describe("How to combine filters. AND = all must match; OR = any can match. Default: AND."),
  orders: z.array(OrderSchema).optional().describe("How to sort results. Can only reference columns in breakdowns or calculations."),
  limit: z.number().int().positive().optional().describe("Maximum number of result rows to return"),
  time_range: z.number().positive().optional().describe("Relative time range in seconds from now (e.g., 3600 for last hour). Default: 2 hours."),
  start_time: z.number().int().positive().optional().describe("Absolute start time as UNIX timestamp in seconds"),
  end_time: z.number().int().positive().optional().describe("Absolute end time as UNIX timestamp in seconds"),
  granularity: z.number().int().nonnegative().optional().describe("Time resolution in seconds for query graph. Use 0 for auto or omit. Max: time_range/10, Min: time_range/1000."),
  havings: z.array(HavingSchema).optional().describe("Post-calculation filters to apply to results after calculations. Each column/calculate_op must exist in calculations. Multiple havings allowed per column/calculate_op."),
}).describe("Honeycomb query parameters. All fields are optional. If no calculations are provided, COUNT will be applied automatically. Use calculations with proper column rules (never use column with COUNT/CONCURRENCY).").refine(
  TimeValidationSchema.refine,
  {
    message: TimeValidationSchema.message,
    path: TimeValidationSchema.path
  }
);

/**
 * Simplified query input schema for basic Honeycomb queries
 */
export const QueryInputSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment to query"),
  dataset: z.string().min(1).trim().describe("The dataset to query"),
  timeRange: z.number().positive().optional().describe("Time range in seconds to query"),
  filter: z.record(z.any()).optional().describe("Filters to apply to the query"),
  breakdowns: z.array(z.string().min(1)).optional().describe("Columns to group results by"),
  calculations: z.array(z.record(z.any())).optional().describe("Calculations to perform on the data"),
}).describe("Simplified query input schema for basic Honeycomb queries");

/**
 * Schema for direct query access
 */
export const DirectQuerySchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment to query"),
  dataset: z.string().min(1).trim().describe("The dataset to query"),
  query: z.record(z.any()).describe("The raw query object to send to Honeycomb API"),
}).describe("Low-level schema for direct query access to Honeycomb API");

/**
 * Schema for column analysis
 */
export const ColumnAnalysisSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the dataset"),
  dataset: z.string().min(1).trim().describe("The dataset containing the column to analyze"),
  columns: z.array(z.string()).min(1).max(10).describe("The names of the columns to analyze"),
  timeRange: z.number().positive().optional().describe("Time range in seconds to analyze. Default is 2 hours."),
}).describe("Parameters for analyzing specific columns in a dataset by running statistical queries and returning computed metrics.");

/**
 * Schema for tracing operations
 */
export const TraceDeepLinkSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset containing the trace"),
  traceId: z.string().describe("The unique trace ID"),
  spanId: z.string().optional().describe("The unique span ID to jump to within the trace"),
  traceStartTs: z.number().int().nonnegative().optional().describe("Start timestamp in Unix epoch seconds"),
  traceEndTs: z.number().int().nonnegative().optional().describe("End timestamp in Unix epoch seconds"),
}).refine(data => {
  // If both timestamps are provided, ensure end > start
  if (data.traceStartTs !== undefined && data.traceEndTs !== undefined) {
    return data.traceEndTs > data.traceStartTs;
  }
  return true;
}, {
  message: "End timestamp must be greater than start timestamp",
  path: ["traceEndTs"]
}).describe("Parameters for generating a direct deep link to a specific trace in the Honeycomb UI.");