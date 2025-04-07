/**
 * Unified schema definitions for collection-based tools
 */
import { z } from "zod";
import { 
  PaginationSchema, 
  FilterOperatorSchema,
  OrderDirectionSchema,
  QueryCalculationSchema,
  HavingSchema,
  FilterSchema,
  OrderSchema 
} from "./schema.js";

/**
 * Base schema for all list tools that require only an environment
 */
export const BaseListSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
}).merge(PaginationSchema);

/**
 * Schema for listing datasets
 */
export const ListDatasetsSchema = BaseListSchema.extend({
  sort_by: z.enum(['name', 'slug', 'created_at', 'last_written_at']).optional(),
}).describe("Parameters for listing datasets in a Honeycomb environment. Returns dataset names, slugs, descriptions, and timestamps.");

/**
 * Schema for listing boards
 */
export const ListBoardsSchema = BaseListSchema.extend({
  sort_by: z.enum(['name', 'id', 'description', 'created_at', 'updated_at']).optional(),
}).describe("Parameters for listing boards (dashboards) in a Honeycomb environment. Returns board names, IDs, descriptions, and timestamps.");

/**
 * Schema for getting a specific board
 */
export const GetBoardSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  boardId: z.string().min(1).trim().describe("The ID of the board to retrieve"),
}).describe("Parameters for retrieving a specific Honeycomb board with all its queries and visualizations.");

/**
 * Schema for listing markers
 */
export const ListMarkersSchema = BaseListSchema.extend({
  sort_by: z.enum(['id', 'message', 'type', 'created_at', 'start_time', 'end_time']).optional(),
}).describe("Parameters for listing markers (deployment events) in a Honeycomb environment. Returns marker details including type, message, and timestamps.");

/**
 * Schema for marker type
 */
export const MarkerTypeSchema = z.enum([
  "deploy", "feature", "incident", "other"
]).describe("Type of Honeycomb marker. Used to categorize events displayed on Honeycomb visualizations.");

/**
 * Schema for listing recipients
 */
export const ListRecipientsSchema = BaseListSchema.extend({
  sort_by: z.enum(['id', 'name', 'type', 'target', 'created_at']).optional(),
}).describe("Parameters for listing notification recipients in a Honeycomb environment. Returns recipient details including type and target.");

/**
 * Schema for listing columns
 */
export const ListColumnsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset to fetch columns from"),
}).merge(PaginationSchema).describe("Parameters for listing columns in a Honeycomb dataset. Returns column names, types, and additional metadata.");

/**
 * Schema for listing SLOs
 */
export const ListSLOsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset to fetch SLOs from"),
}).merge(PaginationSchema).describe("Parameters for listing Service Level Objectives in a Honeycomb dataset. Returns SLO details including targets and time periods.");

/**
 * Schema for getting a specific SLO
 */
export const SLOArgumentsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the SLO"),
  dataset: z.string().min(1).trim().describe("The dataset associated with the SLO"),
  sloId: z.string().min(1).trim().describe("The unique identifier of the SLO to retrieve"),
}).describe("Parameters for retrieving a specific Service Level Objective with its details and current status.");

/**
 * Schema for listing triggers
 */
export const ListTriggersSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset to fetch triggers from"),
}).merge(PaginationSchema).describe("Parameters for listing triggers (alerts) in a Honeycomb dataset. Returns trigger details including conditions and recipients.");

/**
 * Schema for getting a specific trigger
 */
export const TriggerArgumentsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the trigger"),
  dataset: z.string().min(1).trim().describe("The dataset associated with the trigger"),
  triggerId: z.string().min(1).trim().describe("The unique identifier of the trigger to retrieve"),
}).describe("Parameters for retrieving a specific alert trigger with its configuration details and status.");

/**
 * Schema for generating a trace deep link
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
});

/**
 * Schema for analyzing columns
 */
export const ColumnAnalysisSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the dataset"),
  dataset: z.string().min(1).trim().describe("The dataset containing the column to analyze"),
  columns: z.array(z.string()).min(1).max(10).describe("The names of the columns to analyze"),
  timeRange: z.number().positive().optional().describe("Time range in seconds to analyze. Default is 2 hours."),
});

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
}).describe("Honeycomb query parameters. All fields are optional. If no calculations are provided, COUNT will be applied automatically. Use calculations with proper column rules (never use column with COUNT/CONCURRENCY).").refine(data => {
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
}, {
  message: "Invalid time parameters: either use time_range alone, or start_time and end_time together, or time_range with either start_time or end_time",
  path: ["time_range", "start_time", "end_time"]
});