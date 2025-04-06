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

export const OrderDirectionSchema = z.enum(["ascending", "descending"])
  .describe("Available sort directions: \"ascending\" (low to high) or \"descending\" (high to low)");

export const OrderSchema = z.object({
  column: z.string().min(1).trim().describe("Column to order by. Required field. Can reference a column in breakdowns or be used with op for calculations."),
  op: z.string().optional().describe("Operation to order by. When provided, must match a calculation operation (except HEATMAP)."),
  order: OrderDirectionSchema.optional().describe("Sort direction. Default is \"ascending\" if not specified."),
}).describe("Result ordering configuration. Must reference columns in breakdowns or calculations. Examples: {\"column\": \"user_id\"} or {\"column\": \"duration_ms\", \"op\": \"P99\", \"order\": \"descending\"}");

export const QueryCalculationSchema = z.object({
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
  ]).describe(`Available operations:
- NO COLUMN ALLOWED: COUNT (count of events), CONCURRENCY (concurrent operations)
- REQUIRE COLUMN: SUM, AVG, COUNT_DISTINCT, MAX, MIN, P001, P01, P05, P10, P20, P25, P50, P75, P80, P90, P95, P99, P999, RATE_AVG, RATE_SUM, RATE_MAX, HEATMAP`),
  column: z.string().min(1).trim().optional().describe("Column to perform calculation on. REQUIRED for all operations EXCEPT COUNT and CONCURRENCY. Do not include for COUNT or CONCURRENCY."),
}).describe("Calculation to perform. Column rule: never use column with COUNT/CONCURRENCY; required for all other operations.");

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
  ]).describe(`Available operations for having clause:
- NO COLUMN ALLOWED: COUNT (count of events), CONCURRENCY (concurrent operations)
- REQUIRE COLUMN: SUM, AVG, COUNT_DISTINCT, MAX, MIN, P001, P01, P05, P10, P20, P25, P50, P75, P80, P90, P95, P99, P999, RATE_AVG, RATE_SUM, RATE_MAX`),
  column: z.string().min(1).trim().optional().describe("Column to filter on. REQUIRED for all operations EXCEPT COUNT and CONCURRENCY. Do not include for COUNT or CONCURRENCY."),
  op: z.enum(["=", "\!=", ">", ">=", "<", "<="]).describe("Available comparison operators: \"=\", \"!=\", \">\", \">=\", \"<\", \"<=\""),
  value: z.number().describe("Numeric threshold value to compare against"),
}).describe("Post-calculation filter. Column rule: never use column with COUNT/CONCURRENCY; required for all other operations.");

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

export const ColumnAnalysisSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the dataset"),
  dataset: z.string().min(1).trim().describe("The dataset containing the column to analyze"),
  columns: z.array(z.string()).min(1).max(10).describe("The names of the columns to analyze"),
  timeRange: z.number().positive().optional().describe("Time range in seconds to analyze. Default is 2 hours."),
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
