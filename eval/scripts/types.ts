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
  // Flag to enable agent mode (goal-directed analysis with structured thinking)
  agentMode: z.boolean().optional(),
  // Specific analysis goal for agent mode
  goal: z.string().optional(),
  // Additional context or background for agent mode
  initialContext: z.string().optional(),
  // Expected tools the agent should use (for validation)
  expectedTools: z.array(z.string()).optional(),
  // Maximum number of tool calls allowed in conversation or agent mode
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
  // For agent mode: thought process fields
  thought: z.string().optional(),
  plan: z.string().optional(),
  reasoning: z.string().optional(),
  step: z.number().optional(),
  complete: z.boolean().optional(),
  summary: z.string().optional(),
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
    // Track tool-related tokens separately from validation tokens
    toolPrompt: z.number().optional(),    // Tokens used to determine and format tool usage
    toolCompletion: z.number().optional(), // Tokens used to process tool responses
    toolTotal: z.number().optional(),     // Total tokens related to actual tool usage
  }).optional(),
  toolCallCount: z.number().optional(), // Number of tool calls made
  stepCount: z.number().optional(),     // Number of conversation steps
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
  // For single tool calls
  toolResponse: z.any().optional(),
  // For multi-step scenarios or conversation mode
  toolCalls: z.array(ToolCallRecordSchema).optional(),
  validation: z.object({
    passed: z.boolean(),
    score: z.number().optional(), // 0-1 score
    reasoning: z.string(),
    // Agent-specific validation scores
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
  averageToolCalls: z.number().optional(), // Average tool calls across all tests
  averageToolTokens: z.number().optional(), // Average tokens used specifically for tool operations
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