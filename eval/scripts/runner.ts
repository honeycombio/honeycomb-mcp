import fs from 'fs/promises';
import path from 'path';
import { EvalPrompt, EvalResult, EvalSummary, LLMProvider } from './types.js';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ChildProcess } from 'child_process';

interface RunnerConfig {
  promptsDir: string;
  resultsDir: string;
  providers: LLMProvider[];
  selectedModels: Map<string, string[]>; // provider name -> array of model names
  serverCommandLine?: string; // Command to start the MCP server
  serverUrl?: string; // Optional URL for HTTP-based connections
  concurrency: number;
  judge?: { // Optional configuration for the validation judge
    provider: string; // Provider name to use for validation
    model: string;    // Model to use for validation
  };
  verbose?: boolean; // Enable detailed logging
  testFile?: string; // Optional specific test file to run
}

export class EvalRunner {
  private config: RunnerConfig;
  private results: EvalResult[] = [];
  private client: MCPClient | null = null;
  private serverProcess: ChildProcess | null = null;
  private verbose: boolean;

  constructor(config: RunnerConfig) {
    this.config = config;
    this.verbose = config.verbose || process.env.EVAL_VERBOSE === 'true' || false;
  }

  /**
   * Set up the MCP client, either via stdio or HTTP
   */
  async setupClient(): Promise<void> {
    if (this.client) {
      return; // Already set up
    }

    if (this.config.serverCommandLine) {
      console.log(`Starting MCP server...`);
      if (this.verbose) {
        console.log(`Using command: ${this.config.serverCommandLine}`);
      }
      
      // Parse command and arguments - more carefully handling quoted arguments
      const commandLine = this.config.serverCommandLine;
      let inQuote = false;
      let currentArg = '';
      const args: string[] = [];
      
      for (let i = 0; i < commandLine.length; i++) {
        const char = commandLine[i];
        
        if (char === '"' || char === "'") {
          inQuote = !inQuote;
          continue;
        }
        
        if (char === ' ' && !inQuote) {
          if (currentArg) {
            args.push(currentArg);
            currentArg = '';
          }
          continue;
        }
        
        currentArg += char;
      }
      
      // Add the last argument if there is one
      if (currentArg) {
        args.push(currentArg);
      }
      
      // The command is the first argument
      const command = args.shift() || '';
      
      if (this.verbose) {
        console.log(`Parsed command: ${command}, args:`, args);
      }
      
      // Create client
      this.client = new MCPClient({
        name: "honeycomb-mcp-eval",
        version: "1.0.0"
      });
      
      // Create a StdioClientTransport with the command and args
      // This will handle spawning the process internally
      // Create a clean environment object with only string values
      const cleanEnv: Record<string, string> = {};
      Object.entries(process.env).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanEnv[key] = value;
        }
      });
      
      const transport = new StdioClientTransport({
        command,
        args,
        env: cleanEnv  // Forward all environment variables including HONEYCOMB_API_KEY
      });
      
      // Connect to the server
      await this.client.connect(transport);
      
      // Store the process reference for cleanup later
      // @ts-ignore - accessing private property, but we need it for cleanup
      this.serverProcess = transport._process;
      console.log('Connected to MCP server');
      
      // List available tools for verification
      const toolsResult = await this.client.listTools();
      if (this.verbose) {
        console.log(`Available tools (${toolsResult.tools.length}):`, 
          toolsResult.tools.map(t => t.name).join(', '));
      }
    } 
    else if (this.config.serverUrl) {
      // For future: implement HTTP/SSE based connection
      console.log(`HTTP/SSE connections not yet implemented`);
      throw new Error('HTTP/SSE connections not yet implemented');
    } 
    else {
      throw new Error('Either serverCommandLine or serverUrl must be provided');
    }
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        console.log('MCP client closed');
      } catch (error) {
        console.error('Error closing MCP client:', error);
      }
    }
    
    // The server process is actually managed by the transport
    // and should be terminated when the client is closed,
    // but we'll check it just in case
    if (this.serverProcess && !this.serverProcess.killed) {
      try {
        this.serverProcess.kill();
        console.log('MCP server process terminated');
      } catch (error) {
        console.error('Error terminating server process:', error);
      }
    }
  }

  async loadPrompts(): Promise<EvalPrompt[]> {
    const files = await fs.readdir(this.config.promptsDir);
    
    // If a specific test file is specified, only load that one
    let jsonFiles: string[];
    if (this.config.testFile) {
      const testFileName = path.basename(this.config.testFile);
      console.log(`Running single test file: ${testFileName}`);
      
      // Check if it exists
      if (files.includes(testFileName)) {
        jsonFiles = [testFileName];
      } else {
        // Try adding .json extension if not present
        const fileWithExt = testFileName.endsWith('.json') ? testFileName : `${testFileName}.json`;
        if (files.includes(fileWithExt)) {
          jsonFiles = [fileWithExt];
        } else {
          console.error(`Test file not found: ${testFileName}`);
          jsonFiles = [];
        }
      }
    } else {
      jsonFiles = files.filter(file => file.endsWith('.json'));
    }
    
    const prompts: EvalPrompt[] = [];
    
    for (const file of jsonFiles) {
      const content = await fs.readFile(path.join(this.config.promptsDir, file), 'utf-8');
      try {
        const prompt = JSON.parse(content) as EvalPrompt;
        prompts.push(prompt);
      } catch (error) {
        console.error(`Error parsing ${file}:`, error);
      }
    }
    
    return prompts;
  }

  async runEvaluation(prompt: EvalPrompt, provider: LLMProvider, modelName: string): Promise<EvalResult> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }
    
    // Ensure prompt has an ID
    const promptId = prompt.id || `unknown-${Date.now()}`;
    
    const startTime = Date.now();
    
    try {
      // Run as agent mode for all evaluations
      const promptId = prompt.id || 'unknown';
      console.log(`[Eval ${promptId}] Running agent evaluation: ${prompt.prompt.substring(0, 100)}${prompt.prompt.length > 100 ? '...' : ''}`);
      const toolCalls = await this.runAgentMode(prompt, provider, modelName);
      
      const endTime = Date.now();
      
      // Create validation prompt with all tool calls
      const validationPrompt = this.createValidationPrompt(prompt, toolCalls);
      
      // Determine which provider/model to use for validation
      // If judge is configured, use that specific provider and model
      let judgeProvider = provider;
      let judgeModel = modelName;
      
      if (this.config.judge) {
        const configuredJudge = this.config.providers.find(p => 
          p.name === this.config.judge?.provider
        );
        
        if (configuredJudge) {
          judgeProvider = configuredJudge;
          judgeModel = this.config.judge.model;
          const promptId = prompt.id || 'unknown';
      console.log(`[Eval ${promptId}] Using configured judge: ${judgeProvider.name}/${judgeModel}`);
        } else {
          const promptId = prompt.id || 'unknown';
          console.warn(`[Eval ${promptId}] Configured judge provider "${this.config.judge.provider}" not found, falling back to test provider`);
        }
      }
      
      // Set context for token tracking - this is specifically for validation
      if (judgeProvider.setToolCallContext) {
        judgeProvider.setToolCallContext(false);
      }
      
      const validationResponse = await judgeProvider.runPrompt(validationPrompt, judgeModel);
      
      // Parse validation response
      let score: number, passed: boolean, reasoning: string;
      let agentScores = { goalAchievement: 0, reasoningQuality: 0, pathEfficiency: 0 };
      
      // Parse agent-specific validation response
      const goalMatch = validationResponse.match(/GOAL_ACHIEVEMENT:\s*([\d.]+)/);
      const reasoningQualityMatch = validationResponse.match(/REASONING_QUALITY:\s*([\d.]+)/);
      const pathEfficiencyMatch = validationResponse.match(/PATH_EFFICIENCY:\s*([\d.]+)/);
      const overallScoreMatch = validationResponse.match(/OVERALL_SCORE:\s*([\d.]+)/);
      const passedMatch = validationResponse.match(/PASSED:\s*(true|false)/i);
      const reasoningMatch = validationResponse.match(/REASONING:\s*([\s\S]+)/);
      
      // Extract agent-specific scores
      const goalAchievement = goalMatch && goalMatch[1] ? parseFloat(goalMatch[1]) : 0;
      const reasoningQuality = reasoningQualityMatch && reasoningQualityMatch[1] ? parseFloat(reasoningQualityMatch[1]) : 0;
      const pathEfficiency = pathEfficiencyMatch && pathEfficiencyMatch[1] ? parseFloat(pathEfficiencyMatch[1]) : 0;
      
      // Use overall score for the main score
      score = overallScoreMatch && overallScoreMatch[1] ? parseFloat(overallScoreMatch[1]) : 
              (goalAchievement + reasoningQuality + pathEfficiency) / 3; // Average if overall not provided
      
      passed = passedMatch && passedMatch[1] ? passedMatch[1].toLowerCase() === 'true' : false;
      reasoning = reasoningMatch && reasoningMatch[1] ? reasoningMatch[1].trim() : validationResponse;
      
      // Store agent-specific scores
      agentScores = {
        goalAchievement,
        reasoningQuality,
        pathEfficiency
      };
      
      const tokenUsage = provider.getTokenUsage();
      
      // Create result object with appropriate fields
      const result: EvalResult = {
        id: promptId,
        timestamp: new Date().toISOString(),
        prompt,
        toolCalls,
        validation: {
          passed,
          score,
          reasoning,
          // Include agent scores if available
          ...(agentScores ? { agentScores } : {})
        },
        metrics: {
          startTime,
          endTime,
          latencyMs: endTime - startTime,
          tokenUsage,
          toolCallCount: toolCalls.length,
          // Include agent metrics if available
          ...(agentScores ? { 
            agentMetrics: {
              goalAchievement: agentScores.goalAchievement,
              reasoningQuality: agentScores.reasoningQuality,
              pathEfficiency: agentScores.pathEfficiency,
              overallScore: score
            }
          } : {})
        },
        provider: provider.name,
        model: modelName
      };
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      
      return {
        id: promptId,
        timestamp: new Date().toISOString(),
        prompt,
        toolCalls: [],
        validation: {
          passed: false,
          score: 0,
          reasoning: `Tool execution failed with error: ${error instanceof Error ? error.message : String(error)}`
        },
        metrics: {
          startTime,
          endTime,
          latencyMs: endTime - startTime,
          tokenUsage: { prompt: 0, completion: 0, total: 0 },
          toolCallCount: 0
        },
        provider: provider.name,
        model: modelName
      };
    }
  }
  
  /**
   * Create a validation prompt for the LLM to evaluate
   */
  private createValidationPrompt(prompt: EvalPrompt, toolCalls: any[]): string {
    // Find the final summary if there is a completed step
    let finalSummary = '';
    const completedStep = toolCalls.find(call => call.complete);
    if (completedStep && completedStep.summary) {
      if (Array.isArray(completedStep.summary)) {
        finalSummary = `FINAL SUMMARY:\n${completedStep.summary.map((item: {name: string, summary: string}) => 
          `- ${item.name}: ${item.summary}`
        ).join('\n')}`;
      } else {
        finalSummary = `FINAL SUMMARY:\n${completedStep.summary}`;
      }
    }

    // Create a consistent validation prompt format for all evaluations
    const validationPrompt = `
You are evaluating an AI agent's performance on a data analysis task. The agent was given this goal:

GOAL: ${prompt.prompt}

${prompt.context ? `CONTEXT: ${prompt.context}\n\n` : ''}

The agent took ${toolCalls.length} steps to complete the task. Here is the agent's process:

${toolCalls.map((call, index) => `
--- Step ${index + 1} ---
${call.thought ? `THOUGHT: ${call.thought}` : ''}
${call.plan ? `PLAN: ${call.plan}` : ''}
${call.reasoning ? `REASONING: ${call.reasoning}` : ''}
${call.tool ? `TOOL: ${call.tool}` : ''}
${call.parameters ? `PARAMETERS: ${JSON.stringify(call.parameters, null, 2)}` : ''}
${call.response ? `RESPONSE: ${
  typeof call.response === 'string' 
    ? call.response 
    : JSON.stringify(call.response, null, 2)
}` : ''}
${call.complete ? 'TASK COMPLETED' : ''}
${call.error ? `ERROR: ${call.error}` : ''}
`).join('\n')}

${finalSummary ? `\n${finalSummary}\n` : ''}

VALIDATION CRITERIA: ${prompt.validation.prompt}

Evaluate the agent on three dimensions:
1. Goal Achievement (0-1): Did the agent accomplish the primary goal?
2. Reasoning Quality (0-1): How logical and clear was the agent's reasoning?
3. Path Efficiency (0-1): Did the agent take an efficient approach with minimal unnecessary steps?

Format your response as:
GOAL_ACHIEVEMENT: [0-1 score]
REASONING_QUALITY: [0-1 score]
PATH_EFFICIENCY: [0-1 score]
OVERALL_SCORE: [0-1 overall score]
PASSED: [true/false]
REASONING: [detailed explanation]
`;
    
    return validationPrompt;
  }
  
  // runMultiStepMode removed - only using agent mode for evaluations
  
  // Parameter expansion utilities removed - only using agent mode for evaluations
  
  // runConversationMode removed - only using agent mode for evaluations
  
  /**
   * Build simplified tool documentation for agent mode
   * This follows the standard MCP client approach of providing basic tool info
   * without adding custom examples or hints
   */
  private buildToolDocs(tools: any[]): string {
    return tools.map(tool => {
      // Just provide the tool name and description
      return `
## ${tool.name}
${tool.description || 'No description available'}
`;
    }).join('\n');
  }

  /**
   * Run agent mode with minimal instructions to match standard MCP client approach
   */
  private async runAgentMode(prompt: EvalPrompt, provider: LLMProvider, modelName: string): Promise<any[]> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }
    
    // Get available tools
    const toolsResult = await this.client.listTools();
    
    // Extract environment from prompt or use the specified one
    const environment = prompt.environment || 
                       prompt.prompt.match(/['"]([^'"]+?)['"] environment/)?.[1] || 
                       'ms-demo';
    
    // Build simplified tool documentation without examples
    const toolDocs = this.buildToolDocs(toolsResult.tools);
    
    // Set up tracking
    const toolCalls: any[] = [];
    const maxSteps = prompt.maxSteps || 8;
    
    // Initialize agent context with structured instructions but neutral about tool implementation
    let agentContext = `
You are an AI agent performing data analysis on a Honeycomb environment. Your goal is to use the available tools to analyze data and reach specific insights.

GOAL:
${prompt.prompt}

AVAILABLE TOOLS:
${toolDocs}

CONTEXT:
- Environment: "${environment}"
`;

    if (prompt.context) {
      agentContext += `\n\nADDITIONAL CONTEXT:\n${prompt.context}\n`;
    }

    // Response format instructions without hints about tool usage
    agentContext += `
FORMAT YOUR RESPONSE AS:
\`\`\`json
{
  "thought": "Analyze the current situation and what information you have",
  "plan": "Describe your plan for this step and how it contributes to the goal",
  "action": {
    "tool": "tool_name",
    "parameters": {
      "environment": "${environment}",
      "param2": "value2",
      // Other parameters
    }
  },
  "reasoning": "Why this is the best action to take right now"
}
\`\`\`

OR, if you've completed your analysis:

\`\`\`json
{
  "thought": "Analyze what you've learned from all previous steps",
  "plan": "Summarize how you've met the goal",
  "complete": true,
  "summary": [
    {
      "name": "item_name_1", 
      "summary": "Detailed summary about this item"
    },
    {
      "name": "item_name_2",
      "summary": "Detailed summary about this item"
    }
    // Other items as needed
  ],
  "reasoning": "Why the goal has been achieved"
}
\`\`\`
`;

    // Start agent loop
    let done = false;
    let stepCount = 0;
    
    while (!done && stepCount < maxSteps) {
      stepCount++;
      
      // Set context for token tracking
      if (provider.setToolCallContext) {
        provider.setToolCallContext(true);
      }
      
      try {
        // Get agent's next action
        const llmResponse = await provider.runPrompt(agentContext, modelName);
        
        // Improved JSON extraction and validation
        let jsonContent = '';
        let parsedResponse = null;
        
        // Try to find JSON objects directly - look for any JSON-like content
        try {
          // First try to parse directly if the response looks like a JSON object
          if (llmResponse.trim().startsWith('{') && llmResponse.trim().endsWith('}')) {
            jsonContent = llmResponse.trim();
            parsedResponse = JSON.parse(jsonContent);
          } 
          // Next try to extract from code blocks with or without json annotation
          else {
            const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch && jsonMatch[1]) {
              jsonContent = jsonMatch[1].trim();
              parsedResponse = JSON.parse(jsonContent);
            }
          }
        } catch (error) {
          // If we get here, we found what looked like JSON but it couldn't be parsed
          // Let's get detailed diagnostic info about where the parsing failed
          const parseError = error as Error;
          const errorMessage = parseError.message || 'Unknown error';
          const errorLines = errorMessage.split('\n');
          const positionMatch = errorLines[0]?.match(/at position (\d+)/);
          const position = positionMatch && positionMatch[1] ? parseInt(positionMatch[1]) : -1;
          
          // Format error with context around the error position
          let errorContext = '';
          if (position >= 0 && jsonContent) {
            const start = Math.max(0, position - 50);
            const end = Math.min(jsonContent.length, position + 50);
            const before = jsonContent.substring(start, position);
            const after = jsonContent.substring(position, end);
            errorContext = `\nError context:\n...${before}👉HERE👈${after}...\n`;
            
            // Add line number info
            const lines = jsonContent.substring(0, position).split('\n');
            const line = lines.length;
            const lastLine = lines.length > 0 ? lines[lines.length - 1] : '';
            const column = lastLine ? lastLine.length + 1 : 0;
            errorContext += `(Line ${line}, Column ${column})`;
          }
          
          toolCalls.push({
            error: `Error parsing agent response: ${parseError.message || 'Unknown error'}${errorContext}`,
            response: llmResponse,
            timestamp: new Date().toISOString(),
            latencyMs: 0
          });
          
          // Add error message with formatting guidance
          agentContext += `\n\n## Error in Step ${stepCount}:
Error: ${parseError.message || 'Unknown error'}
${errorContext}

Please make sure your response is properly formatted JSON according to the format specified earlier.
`;
          
          continue; // Skip to next iteration rather than breaking
        }
        
        // If we couldn't find or parse any JSON
        if (!parsedResponse) {
          toolCalls.push({
            error: "Invalid agent response format - no valid JSON found",
            response: llmResponse,
            timestamp: new Date().toISOString(),
            latencyMs: 0
          });
          
          // Add guidance to follow the specified format
          agentContext += `\n\n## Error in Step ${stepCount}:
Error: No valid JSON found in your response.

Please make sure your response is properly formatted JSON according to the format specified earlier.
`;
          
          continue; // Skip to next iteration without breaking
        }
        
        // Check if agent is done
        if (parsedResponse.complete) {
          done = true;
          toolCalls.push({
            step: stepCount,
            complete: true,
            thought: parsedResponse.thought,
            plan: parsedResponse.plan,
            summary: parsedResponse.summary,
            reasoning: parsedResponse.reasoning,
            timestamp: new Date().toISOString(),
            latencyMs: 0
          });
          break;
        }
        
        // Prepare tool call
        const { tool, parameters } = parsedResponse.action;
        
        // Ensure environment parameter is set
        if (!parameters.environment) {
          parameters.environment = environment;
        }
        
        // No special parameter handling - pass parameters directly to the tool
        const promptId = prompt.id || 'unknown';
        if (this.verbose) {
          console.log(`[Eval ${promptId}][Step ${stepCount}] Calling tool ${tool} with params`, parameters);
        } else {
          console.log(`[Eval ${promptId}][Step ${stepCount}] ${tool}`);
        }
        
        // Execute tool call
        const callStartTime = Date.now();
        let response;
        try {
          response = await this.client.callTool({
            name: tool,
            arguments: parameters
          });
        } catch (error) {
          response = { error: error instanceof Error ? error.message : String(error) };
        }
        const callEndTime = Date.now();
        
        // Record the tool call with minimal structure
        const toolCall = {
          step: stepCount,
          tool,
          parameters,
          response,
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: callEndTime - callStartTime
        };
        
        toolCalls.push(toolCall);
        
        // Update agent context with step results but without tool-specific guidance
        agentContext += `\n\n## Step ${stepCount} Results:
TOOL CALLED: ${tool}
PARAMETERS: ${JSON.stringify(parameters, null, 2)}
TOOL RESPONSE: ${JSON.stringify(response, null, 2)}

For your next step, analyze this information and decide what to do next.
`;
      } catch (error) {
        // Handle JSON parsing or other errors
        toolCalls.push({
          error: `Error in agent step ${stepCount}: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString(),
          latencyMs: 0
        });
        
        // Update context with error message but maintain formatting guidance
        agentContext += `\n\n## Error in Step ${stepCount}:
Error: ${error instanceof Error ? error.message : String(error)}

Please try again with a valid JSON response following the format specified earlier.
`;
      }
    }
    
    // Handle step limit reached
    if (!done && stepCount >= maxSteps) {
      toolCalls.push({
        error: `Maximum agent steps reached (${maxSteps})`,
        timestamp: new Date().toISOString(),
        latencyMs: 0
      });
    }
    
    return toolCalls;
  }
  
  // extractRequiredParams removed - only using agent mode for evaluations
  
  // Function removed - no special parameter processing

  async runAll(): Promise<EvalSummary> {
    try {
      // Set up MCP client and connect to server
      await this.setupClient();
      
      const prompts = await this.loadPrompts();
      const results: EvalResult[] = [];
      
      // Track if we're actually going to run any evaluations
      let hasProvidersWithModels = false;
      
      // For each provider
      for (const provider of this.config.providers) {
        // Get models for this provider
        const providerModels = this.config.selectedModels.get(provider.name);
        
        // Skip providers that don't have any models in the selectedModels map
        if (!providerModels || providerModels.length === 0) {
          console.log(`Skipping provider ${provider.name} as no models were selected for it`);
          continue;
        }
        
        // Mark that we have at least one provider with models
        hasProvidersWithModels = true;
        
        // For each model for this provider
        for (const modelName of providerModels) {
          if (!modelName) {
            console.warn(`No model name provided for provider: ${provider.name}`);
            continue;
          }
          console.log(`Starting evaluations with provider: ${provider.name}, model: ${modelName}`);
          
          // Improved concurrency implementation with more explicit logging
          const concurrencyLimit = this.config.concurrency;
          console.log(`Running evaluations with concurrency limit: ${concurrencyLimit}`);
          
          // Process prompts in batches based on concurrency limit
          for (let i = 0; i < prompts.length; i += concurrencyLimit) {
            const batch = prompts.slice(i, Math.min(i + concurrencyLimit, prompts.length));
            console.log(`Processing batch of ${batch.length} prompts (${i+1} to ${i+batch.length} of ${prompts.length})`);
            
            // Create an array of promises for each prompt in the batch
            const batchPromises = batch.map(async (prompt: EvalPrompt) => {
              // Ensure prompt has an ID
              if (!prompt.id) {
                const fallbackId = `unknown-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                console.warn(`Warning: Prompt missing ID, using fallback ID: ${fallbackId}`);
                prompt.id = fallbackId;
              }
              
              // Run the evaluation
              return this.runEvaluation(prompt, provider, modelName);
            });
            
            // Wait for all promises in this batch to complete before moving to the next batch
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            console.log(`Completed batch of ${batch.length} prompts`);
          }
        }
      }
      
      // Check if we had any providers with models
      if (!hasProvidersWithModels) {
        throw new Error(`No providers were found with models selected. Check your EVAL_MODELS configuration.
Available providers: ${this.config.providers.map(p => p.name).join(', ')}
Selected models: ${JSON.stringify(Object.fromEntries(this.config.selectedModels.entries()))}`);
      }
      
      // Save all results
      await this.saveResults(results);
      
      // Prepare summary
      const passed = results.filter(r => r.validation.passed).length;
      
      // Calculate average tool calls
      const totalToolCalls = results.reduce((sum, r) => {
        return sum + (r.metrics.toolCallCount || 0);
      }, 0);
      const averageToolCalls = totalToolCalls / results.length;
      
      // Calculate average token usage for tool operations
      const totalToolTokens = results.reduce((sum, r) => {
        return sum + (r.metrics.tokenUsage?.toolTotal || 0);
      }, 0);
      const averageToolTokens = totalToolTokens / results.length;
      
      // All results are from agent mode in our simplified approach
      const hasAgentMetrics = true;
      
      // Build metadata
      const metadata: Record<string, any> = {
        providers: this.config.providers.map(p => p.name),
        models: Object.fromEntries(this.config.selectedModels.entries()),
        hasAgentMetrics
      };
      
      // Add judge info to metadata if configured
      if (this.config.judge) {
        metadata.judge = {
          provider: this.config.judge.provider,
          model: this.config.judge.model
        };
      }
      
      const summary: EvalSummary = {
        timestamp: new Date().toISOString(),
        totalTests: results.length,
        passed,
        failed: results.length - passed,
        successRate: passed / results.length,
        averageLatency: results.reduce((sum, r) => sum + r.metrics.latencyMs, 0) / results.length,
        averageToolCalls,
        averageToolTokens, // Add average tool-specific token usage
        results,
        metadata
      };
      
      return summary;
    } finally {
      // Clean up resources
      await this.cleanup();
    }
  }

  async saveResults(results: EvalResult[]): Promise<void> {
    // Ensure results directory exists
    await fs.mkdir(this.config.resultsDir, { recursive: true });
    
    // Save each result individually
    for (const result of results) {
      const fileName = `${result.id}-${result.provider}-${new Date().toISOString().replace(/[:\.]/g, '-')}.json`;
      await fs.writeFile(
        path.join(this.config.resultsDir, fileName),
        JSON.stringify(result, null, 2),
        'utf-8'
      );
    }
    
    // Save all results in a single file
    await fs.writeFile(
      path.join(this.config.resultsDir, `all-results-${new Date().toISOString().replace(/[:\.]/g, '-')}.json`),
      JSON.stringify(results, null, 2),
      'utf-8'
    );
  }
}