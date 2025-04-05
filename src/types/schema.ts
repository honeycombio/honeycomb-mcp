import { z } from "zod";

/**
* Schema for pagination, filtering, and sorting options
*/
 export const PaginationSchema = z.object({
  page: z.number().optional().describe("Page number (1-based)"),
  limit: z.number().optional().describe("Number of items per page"),
  sort_by: z.string().optional().describe("Field to sort by"),
  sort_order: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
  search: z.string().optional().describe("Search term to filter results"),
  search_fields: z.union([
    z.string(),
    z.array(z.string())
  ]).optional().describe("Fields to search in (string or array of strings)"),
});

// Base schema for dataset arguments
export const DatasetArgumentsBaseSchema = z.object({
  environment: z.string(),
  dataset: z.union([
    z.literal("__all__"),
    z.string().min(1)
  ]),
});

// Dataset arguments with pagination
export const DatasetArgumentsSchema = DatasetArgumentsBaseSchema.merge(PaginationSchema);

// Add a schema for column-related operations
export const ColumnInfoSchema = z.object({
  datasetSlug: z.string(),
  columnName: z.string().optional(),
  type: z.enum(["string", "float", "integer", "boolean"]).optional(),
  includeHidden: z.boolean().optional().default(false),
});

/**
 * Schema for listing columns in a dataset
 */
export const ListColumnsSchema = z.object({
  environment: z.string().describe("The Honeycomb environment"),
  dataset: z.string().describe("The dataset to fetch columns from"),
}).merge(PaginationSchema);

// Input validation schemas using zod
export const QueryInputSchema = z.object({
  environment: z.string(),
  dataset: z.string(),
  timeRange: z.number().optional(),
  filter: z.record(z.any()).optional(),
  breakdowns: z.array(z.string()).optional(),
  calculations: z.array(z.record(z.any())).optional(),
});

// Tool definition schemas
export const queryToolSchema = z.object({
  environment: z.string(),
  dataset: z.string(),
  query: z.record(z.any()),
});

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
]);

export const FilterSchema = z.object({
  column: z.string(),
  op: FilterOperatorSchema,
  value: z
    .union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string()),
      z.array(z.number()),
    ])
    .optional(),
});

export const OrderDirectionSchema = z.enum(["ascending", "descending"]);

export const OrderSchema = z.object({
  column: z.string().optional(),
  op: z.string(),
  order: OrderDirectionSchema,
});

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
  ]),
  column: z.string().optional(),
});

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
  ]),
  column: z.string().optional(),
  op: z.enum(["=", "!=", ">", ">=", "<", "<="]),
  value: z.number(),
});

export const QueryToolSchema = z.object({
  environment: z.string(),
  dataset: z.string(),
  calculations: z.array(QueryCalculationSchema),
  breakdowns: z.array(z.string()).optional(),
  filters: z.array(FilterSchema).optional(),
  filter_combination: z.enum(["AND", "OR"]).optional(),
  orders: z.array(OrderSchema).optional(),
  limit: z.number().optional(),
  time_range: z.number().optional(),
  start_time: z.number().optional(),
  end_time: z.number().optional(),
  granularity: z.number().optional(),
  having: z.array(HavingSchema).optional(),
});

export const ColumnAnalysisSchema = z.object({
  environment: z.string(),
  dataset: z.string(),
  column: z.string(),
  timeRange: z.number().optional(),
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
  environment: z.string(),
  dataset: z.string(),
  sloId: z.string(),
});

export const TriggerArgumentsSchema = z.object({
  environment: z.string(),
  dataset: z.string(),
  triggerId: z.string(),
});

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
  environment: z.string().describe("The Honeycomb environment"),
}).merge(PaginationSchema);

/**
 * Schema for getting a specific board
 */
export const GetBoardSchema = z.object({
  environment: z.string().describe("The Honeycomb environment"),
  boardId: z.string().describe("The ID of the board to retrieve"),
});

/**
 * Schema for marker type
 */
export const MarkerTypeSchema = z.enum([
  "deploy", "feature", "incident", "other"
]);

/**
 * Schema for listing markers
 */
export const ListMarkersSchema = z.object({
  environment: z.string().describe("The Honeycomb environment"),
}).merge(PaginationSchema);

/**
 * Schema for getting a specific marker
 */
export const GetMarkerSchema = z.object({
  environment: z.string().describe("The Honeycomb environment"),
  markerId: z.string().describe("The ID of the marker to retrieve"),
});

/**
 * Schema for listing recipients
 */
export const ListRecipientsSchema = z.object({
  environment: z.string().describe("The Honeycomb environment"),
}).merge(PaginationSchema);

/**
 * Schema for getting a specific recipient
 */
export const GetRecipientSchema = z.object({
  environment: z.string().describe("The Honeycomb environment"),
  recipientId: z.string().describe("The ID of the recipient to retrieve"),
});

/**
 * Schema for generating a trace deep link
 */
export const TraceDeepLinkSchema = z.object({
  environment: z.string().describe("The Honeycomb environment"),
  dataset: z.string().describe("The dataset containing the trace"),
  traceId: z.string().describe("The unique trace ID"),
  spanId: z.string().optional().describe("The unique span ID to jump to within the trace"),
  traceStartTs: z.number().optional().describe("Start timestamp in Unix epoch seconds"),
  traceEndTs: z.number().optional().describe("End timestamp in Unix epoch seconds"),
});
