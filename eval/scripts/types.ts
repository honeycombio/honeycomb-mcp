import { z } from 'zod';

// Schema for a single tool step in a multi-step scenario
export const ToolStepSchema = z.object({
  tool: z.string(),
  parameters: z.record(z.any()),
  description: z.string().optional(),
});

export type ToolStep = z.infer<typeof ToolStepSchema>;

// Schema for test prompts - supporting both single and multi-step scenarios
export const EvalPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // For single tool execution, use these properties
  tool: z.string().optional(),
  prompt: z.string(),
  parameters: z.record(z.any()).optional(),
  // For multi-step tool executions, use this property
  steps: z.array(ToolStepSchema).optional(),
  // Flag to enable conversation mode (multiple back-and-forth steps)
  conversationMode: z.boolean().optional(),
  // Maximum number of tool calls allowed in conversation mode
  maxSteps: z.number().optional(),
  validation: z.object({
    prompt: z.string(),
    expectedOutcome: z.object({
      success: z.boolean(),
      criteria: z.array(z.string()).optional(),
    }).optional(),
  }),
  options: z.object({
    timeout: z.number().optional(),
  }).optional(),
});

export type EvalPrompt = z.infer<typeof EvalPromptSchema>;

// Record of a single tool call
export const ToolCallRecordSchema = z.object({
  tool: z.string(),
  parameters: z.record(z.any()),
  response: z.any(),
  timestamp: z.string(),
  latencyMs: z.number(),
});

export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

// Schema for evaluation metrics
export const MetricsSchema = z.object({
  startTime: z.number(),
  endTime: z.number(),
  latencyMs: z.number(),
  tokenUsage: z.object({
    prompt: z.number().optional(),
    completion: z.number().optional(),
    total: z.number().optional(),
  }).optional(),
  toolCallCount: z.number().optional(), // Number of tool calls made
  stepCount: z.number().optional(),     // Number of conversation steps
});

export type Metrics = z.infer<typeof MetricsSchema>;

// Schema for evaluation results
export const EvalResultSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  prompt: EvalPromptSchema,
  // For single tool calls
  toolResponse: z.any().optional(),
  // For multi-step scenarios or conversation mode
  toolCalls: z.array(ToolCallRecordSchema).optional(),
  validation: z.object({
    passed: z.boolean(),
    score: z.number().optional(), // 0-1 score
    reasoning: z.string(),
  }),
  metrics: MetricsSchema,
  provider: z.string(), // The LLM provider used
  model: z.string(),    // The specific model used
});

export type EvalResult = z.infer<typeof EvalResultSchema>;

// Schema for evaluation summary
export const EvalSummarySchema = z.object({
  timestamp: z.string(),
  totalTests: z.number(),
  passed: z.number(),
  failed: z.number(),
  successRate: z.number(), // 0-1
  averageLatency: z.number(),
  averageToolCalls: z.number().optional(), // Average tool calls across all tests
  results: z.array(EvalResultSchema),
  metadata: z.record(z.any()).optional(),
});

export type EvalSummary = z.infer<typeof EvalSummarySchema>;

// LLM Provider interface
export interface LLMProvider {
  name: string;
  models: string[];
  runPrompt: (prompt: string, model: string) => Promise<string>;
  getTokenUsage: () => { prompt: number; completion: number; total: number };
}