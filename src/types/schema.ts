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

// Base schema for dataset arguments
export const DatasetArgumentsBaseSchema = z.object({
  environment: z.string().min(1).trim(),
  dataset: z.union([
    z.literal("__all__"),
    z.string().min(1).trim()
  ]),
}).strict();

// Dataset arguments with pagination
export const DatasetArgumentsSchema = DatasetArgumentsBaseSchema.merge(PaginationSchema);

// Add a schema for column-related operations
export const ColumnInfoSchema = z.object({
  datasetSlug: z.string().min(1).trim(),
  columnName: z.string().trim().optional(),
  type: z.enum(["string", "float", "integer", "boolean"]).optional(),
  includeHidden: z.boolean().optional().default(false),
}).refine(data => !data.columnName || data.columnName.length > 0, {
  message: "Column name cannot be empty if provided",
  path: ["columnName"]
});

/**
 * Schema for listing columns in a dataset
 */
export const ListColumnsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset to fetch columns from"),
}).merge(PaginationSchema).describe("Parameters for listing columns in a Honeycomb dataset. Returns column names, types, and additional metadata.");

// Input validation schemas using zod
export const QueryInputSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment to query"),
  dataset: z.string().min(1).trim().describe("The dataset to query"),
  timeRange: z.number().positive().optional().describe("Time range in seconds to query"),
  filter: z.record(z.any()).optional().describe("Filters to apply to the query"),
  breakdowns: z.array(z.string().min(1)).optional().describe("Columns to group results by"),
  calculations: z.array(z.record(z.any())).optional().describe("Calculations to perform on the data"),
}).describe("Simplified query input schema for basic Honeycomb queries");

// Tool definition schemas
export const queryToolSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment to query"),
  dataset: z.string().min(1).trim().describe("The dataset to query"),
  query: z.record(z.any()).describe("The raw query object to send to Honeycomb API"),
}).describe("Low-level schema for direct query access to Honeycomb API");

export const FilterOperatorSchema = z.enum([
  "=",
  "!=",
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
]).describe("Filter operator for comparing column values. Use string operators for text columns and mathematical operators for numeric columns.");

export const FilterSchema = z.object({
  column: z.string().min(1).trim().describe("The name of the column to filter on"),
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
    .describe("The value to compare against. Optional for exists/does-not-exist operators. For 'in'/'not-in' operators, provide an array of values."),
}).describe("Filter definition for Honeycomb queries. Filters are applied before any calculations or aggregations.");

export const OrderDirectionSchema = z.enum(["ascending", "descending"])
  .describe("Sort direction for query results");

export const OrderSchema = z.object({
  column: z.string().min(1).trim().optional().describe("The column to order by. Optional for COUNT and CONCURRENCY operations"),
  op: z.string().describe("The operation to order by. Must be one of the calculation operations except HEATMAP"),
  order: OrderDirectionSchema,
}).describe("Specifies how to order query results. Orders are applied after calculations are performed.");

export const QueryCalculationSchema = z.object({
  op: z.enum([
    "COUNT",        // Count of events (no column required)
    "CONCURRENCY",  // Concurrent operations (no column required)
    "SUM",          // Sum of values in column
    "AVG",          // Average of values in column
    "COUNT_DISTINCT", // Count of unique values
    "MAX",          // Maximum value in column
    "MIN",          // Minimum value in column
    "P001",         // 0.1th percentile
    "P01",          // 1st percentile
    "P05",          // 5th percentile
    "P10",          // 10th percentile
    "P20",          // 20th percentile
    "P25",          // 25th percentile (first quartile)
    "P50",          // 50th percentile (median)
    "P75",          // 75th percentile (third quartile)
    "P80",          // 80th percentile
    "P90",          // 90th percentile
    "P95",          // 95th percentile
    "P99",          // 99th percentile
    "P999",         // 99.9th percentile
    "RATE_AVG",     // Rate of change in average
    "RATE_SUM",     // Rate of change in sum
    "RATE_MAX",     // Rate of change in maximum
    "HEATMAP",      // Heat map visualization
  ]).describe("The calculation operation to perform on the data. COUNT and CONCURRENCY don't require a column. All others do."),
  column: z.string().min(1).trim().optional().describe("The column to perform the calculation on. Required for all operations except COUNT and CONCURRENCY."),
}).describe("Defines a calculation to perform on the dataset. Honeycomb is a column-oriented database, and calculations aggregate values across events.");

export const HavingSchema = z.object({
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
    // Note: HEATMAP is not allowed in HAVING clauses
  ]).describe("The calculation operation to filter by. Must be one of the operations used in a calculation."),
  column: z.string().min(1).trim().optional().describe("The column to filter on. Required for all operations except COUNT and CONCURRENCY."),
  op: z.enum(["=", "!=", ">", ">=", "<", "<="]).describe("Comparison operator for the having clause"),
  value: z.number().describe("Numeric threshold value to compare against"),
}).describe("A HAVING clause for filtering results after calculations are performed. Only results that match this condition will be included.");

export const QueryToolSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment to query"),
  dataset: z.string().min(1).trim().describe("The dataset to query. Use __all__ to query across all datasets in the environment."),
  calculations: z.array(QueryCalculationSchema).describe("List of calculations to perform on the dataset. At least one calculation is required."),
  breakdowns: z.array(z.string().min(1).trim()).optional().describe("Columns to group results by. Creates separate results for each unique combination of values in these columns."),
  filters: z.array(FilterSchema).optional().describe("Pre-calculation filters to apply to the data. Restricts which events are included in the analysis."),
  filter_combination: z.enum(["AND", "OR"]).optional().describe("How to combine multiple filters. AND requires all filters to match; OR requires any filter to match. Default is AND."),
  orders: z.array(OrderSchema).optional().describe("How to sort the results. Can only reference columns in breakdowns or operations in calculations."),
  limit: z.number().int().positive().optional().describe("Maximum number of result rows to return"),
  time_range: z.number().positive().optional().describe("Relative time range in seconds from now. E.g., 3600 for the last hour."),
  start_time: z.number().int().positive().optional().describe("Absolute start time as UNIX timestamp in seconds"),
  end_time: z.number().int().positive().optional().describe("Absolute end time as UNIX timestamp in seconds"),
  granularity: z.number().int().nonnegative().optional().describe("Time resolution in seconds for time series results. Use 0 for auto or omit."),
  having: z.array(HavingSchema).optional().describe("Post-calculation filters to apply to results. Used to filter based on calculation outcomes."),
}).describe("Honeycomb query parameters. Honeycomb is a column-oriented observability database optimized for high-cardinality data.").refine(data => {
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

export const ColumnAnalysisSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the dataset"),
  dataset: z.string().min(1).trim().describe("The dataset containing the column to analyze"),
  column: z.string().min(1).trim().describe("The name of the column to analyze"),
  timeRange: z.number().positive().optional().describe("Time range in seconds to analyze. Default is 2 hours."),
  maxValues: z.number().int().positive().optional().describe("Maximum number of distinct values to return for the column. Default is 20."),
}).describe("Parameters for analyzing a column in a Honeycomb dataset. Returns distribution and statistics about column values.").superRefine((data, ctx) => {
  if (data.maxValues && data.maxValues > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.too_big,
      maximum: 100,
      type: "number",
      inclusive: true,
      path: ["maxValues"],
      message: "Maximum value count cannot exceed 100"
    });
  }
});

export const PromptSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  arguments: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        required: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const SLOArgumentsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the SLO"),
  dataset: z.string().min(1).trim().describe("The dataset associated with the SLO"),
  sloId: z.string().min(1).trim().describe("The unique identifier of the SLO to retrieve"),
}).describe("Parameters for retrieving a specific Service Level Objective with its details and current status.");

export const TriggerArgumentsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the trigger"),
  dataset: z.string().min(1).trim().describe("The dataset associated with the trigger"),
  triggerId: z.string().min(1).trim().describe("The unique identifier of the trigger to retrieve"),
}).describe("Parameters for retrieving a specific alert trigger with its configuration details and status.");

export const NotificationRecipientSchema = z.object({
  id: z.string(),
  type: z.enum([
    "pagerduty",
    "email",
    "slack",
    "webhook",
    "msteams",
    "msteams_workflow",
  ]),
  target: z.string().optional(),
  details: z
    .object({
      pagerduty_severity: z
        .enum(["critical", "error", "warning", "info"])
        .optional(),
    })
    .optional(),
});

export const TriggerThresholdSchema = z.object({
  op: z.enum([">", ">=", "<", "<="]),
  value: z.number(),
  exceeded_limit: z.number().optional(),
});

export const WeekdaySchema = z.enum([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

export const TimeStringSchema = z
  .string()
  .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/);

export const EvaluationScheduleSchema = z.object({
  window: z.object({
    days_of_week: z.array(WeekdaySchema),
    start_time: TimeStringSchema,
    end_time: TimeStringSchema,
  }),
});

export const TriggerSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  threshold: TriggerThresholdSchema,
  frequency: z.number(),
  alert_type: z.enum(["on_change", "on_true"]).optional(),
  disabled: z.boolean(),
  triggered: z.boolean(),
  recipients: z.array(NotificationRecipientSchema),
  evaluation_schedule_type: z.enum(["frequency", "window"]).optional(),
  evaluation_schedule: EvaluationScheduleSchema.optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SLISchema = z.object({
  alias: z.string(),
});

export const SLOSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  sli: SLISchema,
  time_period_days: z.number(),
  target_per_million: z.number(),
  reset_at: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SLODetailedResponseSchema = SLOSchema.extend({
  compliance: z.number(),
  budget_remaining: z.number(),
});

export const DatasetConfigSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

export const ConfigSchema = z.object({
  datasets: z.array(DatasetConfigSchema),
});

// PaginationSchema is already defined above

/**
 * Schema for listing boards
 */
export const ListBoardsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
}).merge(PaginationSchema).describe("Parameters for listing Honeycomb boards. Returns a paginated list of boards with metadata.");

/**
 * Schema for getting a specific board
 */
export const GetBoardSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  boardId: z.string().min(1).trim().describe("The ID of the board to retrieve"),
}).describe("Parameters for retrieving a specific Honeycomb board with all its queries and visualizations.");

/**
 * Schema for marker type
 */
export const MarkerTypeSchema = z.enum([
  "deploy", "feature", "incident", "other"
]).describe("Type of Honeycomb marker. Used to categorize events displayed on Honeycomb visualizations.");

/**
 * Schema for listing markers
 */
export const ListMarkersSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
}).merge(PaginationSchema).describe("Parameters for listing Honeycomb markers. Markers represent significant events like deployments or incidents.");

/**
 * Schema for getting a specific marker
 */
export const GetMarkerSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  markerId: z.string().min(1).trim().describe("The ID of the marker to retrieve"),
}).describe("Parameters for retrieving a specific Honeycomb marker with its details.");

/**
 * Schema for listing recipients
 */
export const ListRecipientsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
}).merge(PaginationSchema).describe("Parameters for listing notification recipients in a Honeycomb environment. Recipients receive alerts from triggers.");

/**
 * Schema for getting a specific recipient
 */
export const GetRecipientSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  recipientId: z.string().min(1).trim().describe("The ID of the recipient to retrieve"),
}).describe("Parameters for retrieving details about a specific notification recipient.");

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
