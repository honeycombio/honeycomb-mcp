/**
 * @deprecated This file is being phased out in favor of base-schemas.ts, query-schemas.ts, and resource-schemas.ts
 * Do not add new schemas here. Import from the appropriate schema file instead.
 */

import { z } from "zod";
import {
  PaginationSchema,
  BaseEnvSchema,
  BaseListSchema,
  BaseDatasetSchema,
  FilterOperatorSchema,
  FilterSchema,
  OrderDirectionSchema,
  OrderSchema,
  QueryCalculationSchema,
  HavingSchema,
  TimeValidationSchema
} from "./base-schemas.js";
import {
  QueryToolSchema,
  ColumnAnalysisSchema,
  QueryInputSchema,
  DirectQuerySchema, 
  TraceDeepLinkSchema
} from "./query-schemas.js";
import {
  ListDatasetsSchema,
  ListBoardsSchema,
  GetBoardSchema,
  MarkerTypeSchema,
  ListMarkersSchema,
  GetMarkerSchema,
  ListRecipientsSchema,
  GetRecipientSchema,
  ListColumnsSchema,
  ColumnInfoSchema,
  ListSLOsSchema,
  SLOArgumentsSchema,
  ListTriggersSchema,
  TriggerArgumentsSchema,
  NotificationRecipientSchema,
  TriggerThresholdSchema,
  WeekdaySchema,
  TimeStringSchema,
  EvaluationScheduleSchema,
  TriggerSchema,
  SLISchema,
  SLOSchema,
  SLODetailedResponseSchema
} from "./resource-schemas.js";

// Re-export everything for backwards compatibility
export {
  PaginationSchema,
  BaseEnvSchema,
  BaseListSchema,
  BaseDatasetSchema,
  FilterOperatorSchema,
  FilterSchema,
  OrderDirectionSchema,
  OrderSchema,
  QueryCalculationSchema,
  HavingSchema,
  QueryToolSchema,
  ColumnAnalysisSchema,
  QueryInputSchema,
  DirectQuerySchema,
  TraceDeepLinkSchema,
  ListDatasetsSchema,
  ListBoardsSchema,
  GetBoardSchema,
  MarkerTypeSchema,
  ListMarkersSchema,
  GetMarkerSchema,
  ListRecipientsSchema,
  GetRecipientSchema,
  ListColumnsSchema,
  ColumnInfoSchema,
  ListSLOsSchema,
  SLOArgumentsSchema,
  ListTriggersSchema,
  TriggerArgumentsSchema,
  NotificationRecipientSchema,
  TriggerThresholdSchema,
  WeekdaySchema,
  TimeStringSchema,
  EvaluationScheduleSchema,
  TriggerSchema,
  SLISchema,
  SLOSchema,
  SLODetailedResponseSchema
};

// Additional schemas that haven't been migrated yet
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

export const DatasetArgumentsBaseSchema = z.object({
  environment: z.string().min(1).trim(),
  dataset: z.union([
    z.literal("__all__"),
    z.string().min(1).trim()
  ]),
}).strict();

export const DatasetArgumentsSchema = DatasetArgumentsBaseSchema.merge(PaginationSchema);

export const DatasetConfigSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
});

export const ConfigSchema = z.object({
  datasets: z.array(DatasetConfigSchema),
});