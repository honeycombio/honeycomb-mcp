/**
 * Schemas for Honeycomb resources such as boards, markers, triggers, SLOs, etc.
 */
import { z } from "zod";
import { BaseListSchema, BaseDatasetSchema, BaseEnvSchema } from "./base-schemas.js";

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
export const GetBoardSchema = BaseEnvSchema.extend({
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
export const ListMarkersSchema = BaseListSchema.extend({
  sort_by: z.enum(['id', 'message', 'type', 'created_at', 'start_time', 'end_time']).optional(),
}).describe("Parameters for listing markers (deployment events) in a Honeycomb environment. Returns marker details including type, message, and timestamps.");

/**
 * Schema for getting a specific marker
 */
export const GetMarkerSchema = BaseEnvSchema.extend({
  markerId: z.string().min(1).trim().describe("The ID of the marker to retrieve"),
}).describe("Parameters for retrieving a specific Honeycomb marker with its details.");

/**
 * Schema for listing notification recipients
 */
export const ListRecipientsSchema = BaseListSchema.extend({
  sort_by: z.enum(['id', 'name', 'type', 'target', 'created_at']).optional(),
}).describe("Parameters for listing notification recipients in a Honeycomb environment. Returns recipient details including type and target.");

/**
 * Schema for getting a specific recipient
 */
export const GetRecipientSchema = BaseEnvSchema.extend({
  recipientId: z.string().min(1).trim().describe("The ID of the recipient to retrieve"),
}).describe("Parameters for retrieving details about a specific notification recipient.");

/**
 * Schema for columns in a dataset
 */
export const ListColumnsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset to fetch columns from"),
}).merge(z.object({
  page: z.number().positive().int().optional().describe("Page number (1-based)"),
  limit: z.number().positive().int().optional().describe("Number of items per page"),
  sort_by: z.string().optional().describe("Field to sort by"),
  sort_order: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
  search: z.string().trim().optional().describe("Search term to filter column names"),
})).describe("Parameters for listing columns in a Honeycomb dataset. Returns column names, types, and additional metadata.");

/**
 * Schema for column info operations
 */
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
 * Schema for listing SLOs
 */
export const ListSLOsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment"),
  dataset: z.string().min(1).trim().describe("The dataset to fetch SLOs from"),
}).merge(z.object({
  page: z.number().positive().int().optional().describe("Page number (1-based)"),
  limit: z.number().positive().int().optional().describe("Number of items per page"),
  sort_by: z.string().optional().describe("Field to sort by"),
  sort_order: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
})).describe("Parameters for listing Service Level Objectives in a Honeycomb dataset. Returns SLO details including targets and time periods.");

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
}).merge(z.object({
  page: z.number().positive().int().optional().describe("Page number (1-based)"),
  limit: z.number().positive().int().optional().describe("Number of items per page"),
  sort_by: z.string().optional().describe("Field to sort by"),
  sort_order: z.enum(['asc', 'desc']).optional().describe("Sort direction"),
  search: z.string().trim().optional().describe("Search term to filter trigger names"),
})).describe("Parameters for listing triggers (alerts) in a Honeycomb dataset. Returns trigger details including conditions and recipients.");

/**
 * Schema for getting a specific trigger
 */
export const TriggerArgumentsSchema = z.object({
  environment: z.string().min(1).trim().describe("The Honeycomb environment containing the trigger"),
  dataset: z.string().min(1).trim().describe("The dataset associated with the trigger"),
  triggerId: z.string().min(1).trim().describe("The unique identifier of the trigger to retrieve"),
}).describe("Parameters for retrieving a specific alert trigger with its configuration details and status.");

/**
 * Schema for Notification Recipient
 */
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

/**
 * Schema for trigger threshold
 */
export const TriggerThresholdSchema = z.object({
  op: z.enum([">", ">=", "<", "<="]),
  value: z.number(),
  exceeded_limit: z.number().optional(),
});

/**
 * Schema for weekday
 */
export const WeekdaySchema = z.enum([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]);

/**
 * Schema for time string (HH:MM)
 */
export const TimeStringSchema = z
  .string()
  .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/);

/**
 * Schema for evaluation schedule
 */
export const EvaluationScheduleSchema = z.object({
  window: z.object({
    days_of_week: z.array(WeekdaySchema),
    start_time: TimeStringSchema,
    end_time: TimeStringSchema,
  }),
});

/**
 * Schema for trigger
 */
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

/**
 * Schema for SLI
 */
export const SLISchema = z.object({
  alias: z.string(),
});

/**
 * Schema for SLO
 */
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

/**
 * Schema for Detailed SLO Response
 */
export const SLODetailedResponseSchema = SLOSchema.extend({
  compliance: z.number(),
  budget_remaining: z.number(),
});