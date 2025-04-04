import { z } from 'zod';

// Schema for test prompts
export const EvalPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tool: z.string(),
  prompt: z.string(),
  parameters: z.record(z.any()),
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
});

export type Metrics = z.infer<typeof MetricsSchema>;

// Schema for evaluation results
export const EvalResultSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  prompt: EvalPromptSchema,
  toolResponse: z.any(),
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