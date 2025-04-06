import { z } from 'zod';

// Schema for agent thought process
export const AgentThoughtSchema = z.object({
  thought: z.string().optional(),
  plan: z.string().optional(), 
  reasoning: z.string().optional(),
  step: z.number().optional(),
  complete: z.boolean().optional(),
  summary: z.string().optional(),
});

export type AgentThought = z.infer<typeof AgentThoughtSchema>;

// Record of a single tool call
export const ToolCallRecordSchema = z.object({
  tool: z.string(),
  parameters: z.record(z.any()),
  response: z.any(),
  timestamp: z.string(),
  latencyMs: z.number(),
  // Agent thought process fields
  thought: z.string().optional(),
  plan: z.string().optional(),
  reasoning: z.string().optional(),
  step: z.number().optional(),
  complete: z.boolean().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
});

export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;

// Schema for test prompts - simplified for agent-based approach
export const EvalPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  // The prompt or goal for the agent to achieve
  prompt: z.string(),
  // Additional context or background information
  context: z.string().optional(),
  // Expected tools the agent should use (for validation)
  expectedTools: z.array(z.string()).optional(),
  // Maximum number of tool calls allowed
  maxSteps: z.number().optional(),
  // Environment to use for the evaluation
  environment: z.string().optional(),
  // Validation criteria
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
    // Track tool-related tokens separately from validation tokens
    toolPrompt: z.number().optional(), 
    toolCompletion: z.number().optional(),
    toolTotal: z.number().optional(),
  }).optional(),
  toolCallCount: z.number().optional(),
  // Agent-specific metrics
  agentMetrics: z.object({
    goalAchievement: z.number().optional(),  // 0-1 score on goal completion
    reasoningQuality: z.number().optional(), // 0-1 score on reasoning quality
    pathEfficiency: z.number().optional(),   // 0-1 score on path efficiency
    overallScore: z.number().optional(),     // 0-1 overall agent performance
  }).optional(),
});

export type Metrics = z.infer<typeof MetricsSchema>;

// Schema for evaluation results
export const EvalResultSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  prompt: EvalPromptSchema,
  toolCalls: z.array(ToolCallRecordSchema),
  validation: z.object({
    passed: z.boolean(),
    score: z.number().optional(), // 0-1 score
    reasoning: z.string(),
    // Agent validation scores
    agentScores: z.object({
      goalAchievement: z.number().optional(),  // 0-1 score on goal completion
      reasoningQuality: z.number().optional(), // 0-1 score on reasoning quality 
      pathEfficiency: z.number().optional(),   // 0-1 score on path efficiency
    }).optional(),
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
  averageToolCalls: z.number().optional(),
  averageToolTokens: z.number().optional(),
  results: z.array(EvalResultSchema),
  metadata: z.record(z.any()).optional(),
});

export type EvalSummary = z.infer<typeof EvalSummarySchema>;

// LLM Provider interface
export interface LLMProvider {
  name: string;
  models: string[];
  
  // Context setting to differentiate between validation and tool calls
  setToolCallContext?: (isToolCall: boolean) => void;
  
  // Run a prompt with the LLM
  runPrompt: (prompt: string, model: string) => Promise<string>;
  
  // Get token usage statistics
  getTokenUsage: () => { 
    prompt: number; 
    completion: number; 
    total: number; 
    toolPrompt?: number; 
    toolCompletion?: number; 
    toolTotal?: number;
  };
}