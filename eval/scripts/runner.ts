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
      console.log(`Running agent evaluation: ${prompt.prompt}`);
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
          console.log(`Using configured judge: ${judgeProvider.name}/${judgeModel}`);
        } else {
          console.warn(`Configured judge provider "${this.config.judge.provider}" not found, falling back to test provider`);
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
  
  /**
   * Run a pre-defined sequence of tool calls with parameter expansion
   * Supports using results from previous steps in subsequent calls via variable expansion
   */
  private async runMultiStepMode(steps: any[]): Promise<any[]> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }
    
    const toolCalls: any[] = [];
    const stepResults: Record<number, any> = {}; // Store results by step index for reference
    
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      
      // Expand parameters using previous step results
      if (this.verbose) {
        console.log(`Step ${stepIndex}: Original parameters before expansion:`, JSON.stringify(step.parameters));
      }
      const expandedParameters = this.expandStepParameters(step.parameters, stepResults);
      
      if (this.verbose) {
        console.log(`Step ${stepIndex}: Calling tool ${step.tool} with expanded params:`, JSON.stringify(expandedParameters));
      } else {
        console.log(`Step ${stepIndex}: ${step.tool}`);
      }
      const callStartTime = Date.now();
      
      try {
        const response = await this.client.callTool({
          name: step.tool,
          arguments: expandedParameters
        });
        
        const callEndTime = Date.now();
        
        // Store the result for potential use in later steps
        stepResults[stepIndex] = response;
        
        toolCalls.push({
          tool: step.tool,
          parameters: expandedParameters,
          response,
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: callEndTime - callStartTime
        });
      } catch (error) {
        // Record the error but continue with next steps
        toolCalls.push({
          tool: step.tool,
          parameters: expandedParameters,
          response: { error: error instanceof Error ? error.message : String(error) },
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: Date.now() - callStartTime
        });
      }
    }
    
    return toolCalls;
  }
  
  /**
   * Expand parameter values using previous step results
   * Supports referencing previous results with patterns like ${{step:0.path.to.value}}
   * Also supports fallbacks with ${{step:0.path.to.value||fallback}}
   */
  private expandStepParameters(parameters: any, stepResults: Record<number, any>): any {
    if (!parameters) return parameters;
    
    const expandString = (value: string): string => {
      // Match patterns like ${{step:0.columns[0].name}} or ${{step:0.columns[0].name||fallback}}
      return value.replace(/\$\{\{step:(\d+)\.([^}|]+)(?:\|\|([^}]+))?\}\}/g, (match, stepNum, path, fallback) => {
        const stepIndex = parseInt(stepNum, 10);
        if (!stepResults[stepIndex]) {
          console.warn(`Warning: Reference to step ${stepIndex} result but step either failed or doesn't exist`);
          return fallback || 'duration_ms'; // Use fallback or a sensible default
        }
        
        try {
          // Parse the path expression and extract the value
          const value = this.getValueByPath(stepResults[stepIndex], path);
          if (value === undefined || value === null) {
            if (this.verbose) {
              console.warn(`Warning: Path ${path} in step ${stepIndex} result returned null/undefined.`);
              console.log(`Available properties at step ${stepIndex}:`, Object.keys(stepResults[stepIndex]).join(', '));
            }
            
            // Use fallback value if provided, or try some sensible defaults based on context
            if (fallback) {
              return fallback;
            }
            
            // Try to determine a reasonable default based on the parameter context
            if (path.includes('column') || path.endsWith('.key')) {
              if (path.includes('duration') || match.includes('duration')) {
                return 'duration_ms';
              } else if (path.includes('name') || match.includes('name')) {
                return 'name';
              } else {
                // Check if we can find any duration-related columns
                const columnsData = stepResults[stepIndex].columns;
                if (Array.isArray(columnsData)) {
                  const durationColumn = columnsData.find(col => 
                    col.key?.includes('duration') || col.description?.includes('duration')
                  );
                  if (durationColumn) {
                    console.log(`Found fallback duration column: ${durationColumn.key}`);
                    return durationColumn.key;
                  }
                  
                  // If no duration column, use the first column
                  if (columnsData.length > 0 && columnsData[0].key) {
                    console.log(`Using first available column as fallback: ${columnsData[0].key}`);
                    return columnsData[0].key;
                  }
                }
              }
            }
            
            return 'duration_ms'; // Final fallback
          }
          
          return String(value); // Force conversion to string to ensure it works in string templates
        } catch (e) {
          console.warn(`Warning: Failed to extract path ${path} from step ${stepIndex} result:`, e);
          console.log(`Result structure for step ${stepIndex}:`, JSON.stringify(stepResults[stepIndex]).substring(0, 200) + '...');
          
          // Use fallback or default
          return fallback || 'duration_ms';
        }
      });
    };
    
    // Recursively process all parameter values
    const expandValue = (value: any): any => {
      if (typeof value === 'string') {
        return expandString(value);
      } else if (Array.isArray(value)) {
        return value.map(item => expandValue(item));
      } else if (value !== null && typeof value === 'object') {
        const result: Record<string, any> = {};
        for (const [k, v] of Object.entries(value)) {
          result[k] = expandValue(v);
        }
        return result;
      }
      return value;
    };
    
    return expandValue(parameters);
  }
  
  /**
   * Extract a value from an object using a path expression
   * Supports dot notation (user.name) and array access (items[0].name)
   */
  private getValueByPath(obj: any, path: string): any {
    // Handle array indexing patterns like columns[0].name
    const normalizedPath = path.replace(/\[(\d+)\]/g, '.$1');
    const parts = normalizedPath.split('.');
    
    let current = obj;
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }
  
  /**
   * Run conversation mode where an LLM drives tool selection
   * This would typically involve:
   * 1. LLM decides which tool to call
   * 2. Tool is called and result is returned to LLM
   * 3. LLM decides next action until completion
   * 
   * Note: This is a simplified implementation. A full implementation would use
   * a proper agent framework or MCP conversation API.
   * 
   * The implementation includes special handling for:
   * - Parameter validation and enforcement
   * - Structured query building for run_query
   * - Progressive analysis guidance
   */
  private async runConversationMode(prompt: EvalPrompt, provider: LLMProvider, modelName: string): Promise<any[]> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }
    
    // Get available tools
    const toolsResult = await this.client.listTools();
    
    // Extract environment from prompt
    const conversationEnvironment = prompt.prompt.match(/['"]([^'"]+?)['"] environment/)?.[1] || 'ms-demo';
    
    // Build detailed tool documentation with required parameters
    const availableTools = toolsResult.tools.map(t => {
      // Extract parameter information
      const parameterInfo = t.parameters ? 
        this.extractRequiredParams(t.parameters) : 
        "No parameters required";
      
      return {
        name: t.name,
        description: t.description || 'No description available',
        parameters: parameterInfo
      };
    });
    
    // Set up conversation tracking
    const toolCalls: any[] = [];
    const maxSteps = prompt.maxSteps || 5; // Default to 5 if not specified
    let conversationContext = `
You are performing a multi-step data analysis task. Your goal is to use the available tools to progressively analyze data, where each step builds on information from previous steps.

TASK:
${prompt.prompt}

IMPORTANT CONTEXT:
- You are working with the environment: "${conversationEnvironment}"
- Always include the "environment" parameter with value "${conversationEnvironment}" in your tool calls
- Make sure to use information from previous steps to inform each new step

AVAILABLE TOOLS:
${availableTools.map(t => `
## ${t.name}
${t.description}

Parameters:
${t.parameters}
${t.name === 'run_query' ? `
Example usage:
\`\`\`json
{
  "environment": "${conversationEnvironment}",
  "dataset": "dataset_name", 
  "calculations": [
    {"op": "COUNT"},
    {"op": "AVG", "column": "duration_ms"}
  ],
  "breakdowns": ["service.name"],
  "time_range": 3600
}
\`\`\`
` : ''}
`).join('\n')}

FORMAT INSTRUCTIONS:
When you want to use a tool, respond with:
\`\`\`json
{
  "tool": "tool_name",
  "parameters": {
    "environment": "${conversationEnvironment}",
    "param2": "value2",
    ...
  },
  "reasoning": "Brief explanation of why you're using this tool and how it builds on previous steps"
}
\`\`\`

When you've completed the analysis, respond with:
\`\`\`json
{ 
  "done": true, 
  "explanation": "Detailed explanation of your findings and how you progressively built your analysis"
}
\`\`\`
`;
    
    // Start conversation loop
    let done = false;
    let stepCount = 0;
    
    while (!done && stepCount < maxSteps) {
      stepCount++;
      
      // Set context for token tracking - this is specifically for tool usage
      if (provider.setToolCallContext) {
        provider.setToolCallContext(true);
      }
      
      try {
        // Ask LLM what tool to use
        const llmResponse = await provider.runPrompt(conversationContext, modelName);
        
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
            error: `Error parsing conversation response: ${parseError.message || 'Unknown error'}${errorContext}`,
            response: llmResponse,
            timestamp: new Date().toISOString(),
            latencyMs: 0
          });
          
          // Update context with detailed error and guidance
          conversationContext += `\n\n## Error in Step ${stepCount}:
Error: ${parseError.message || 'Unknown error'}
${errorContext}

Please fix your JSON format. Common issues include:
1. Missing or extra commas between properties
2. Missing quotes around property names or string values
3. Trailing commas at the end of objects or arrays
4. Unescaped quotes or special characters in strings

Try again with valid JSON formatting.
`;
          continue; // Skip to next iteration rather than breaking
        }
        
        // If we couldn't find or parse any JSON
        if (!parsedResponse) {
          toolCalls.push({
            error: "Invalid conversation response format - no valid JSON found",
            response: llmResponse,
            timestamp: new Date().toISOString(),
            latencyMs: 0
          });
          
          // Add guidance to the context
          conversationContext += `\n\n## Error in Step ${stepCount}:
Error: No valid JSON found in your response.

Remember to format your response as JSON within triple backticks:
\`\`\`json
{
  "tool": "tool_name",
  "parameters": {
    "environment": "${conversationEnvironment}",
    "param2": "value2",
    ...
  },
  "reasoning": "Brief explanation of why you're using this tool"
}
\`\`\`

Try again with valid JSON formatting.
`;
          continue; // Skip to next iteration without breaking
        }
        
        // Check if done
        if (parsedResponse.done) {
          done = true;
          toolCalls.push({
            done: true,
            explanation: parsedResponse.explanation || "Task completed",
            timestamp: new Date().toISOString(),
            latencyMs: 0
          });
          break;
        }
        
        // Call the requested tool
        const { tool, parameters, reasoning } = parsedResponse;
        
        // Ensure environment parameter is set
        if (!parameters.environment) {
          parameters.environment = conversationEnvironment;
        }
        
        // Special handling for run_query tool to ensure parameters are valid
        let processedParameters = { ...parameters };
        if (tool === 'run_query') {
          processedParameters = this.ensureValidQueryParameters(processedParameters);
        }
        
        if (this.verbose) {
          console.log(`[Step ${stepCount}] Calling tool ${tool} with params`, processedParameters);
        } else {
          console.log(`[Step ${stepCount}] ${tool}`);
        }
        
        const callStartTime = Date.now();
        let response;
        try {
          response = await this.client.callTool({
            name: tool,
            arguments: processedParameters
          });
        } catch (error) {
          response = { error: error instanceof Error ? error.message : String(error) };
        }
        const callEndTime = Date.now();
        
        // Record the tool call
        const toolCall = {
          tool,
          parameters: processedParameters,
          reasoning: reasoning || "No reasoning provided",
          response,
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: callEndTime - callStartTime
        };
        toolCalls.push(toolCall);
        
        // Update conversation context with more guidance
        conversationContext += `\n\n## Step ${stepCount} Results:
You called tool: ${tool}
Your reasoning: ${reasoning || "No reasoning provided"}
Parameters: ${JSON.stringify(parameters)}
Tool response: ${JSON.stringify(response)}

What would you like to do next? Remember to:
1. Use the information you just learned to inform your next step
2. Include "${conversationEnvironment}" as the environment parameter
3. Explain your reasoning for the next step
`;
      } catch (error) {
        // Handle errors in the conversation
        toolCalls.push({
          error: `Error in conversation step ${stepCount}: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString(),
          latencyMs: 0
        });
        
        // Update context with error and more guidance
        conversationContext += `\n\n## Error in Step ${stepCount}:
Error: ${error instanceof Error ? error.message : String(error)}

This might be because:
- Required parameters were missing (especially "environment")
- The tool name was incorrect
- Parameters were not formatted correctly

Please try again with correct parameters. Make sure to:
1. Always include "environment": "${conversationEnvironment}" in your parameters
2. Check that other required parameters are included
3. Format your response as valid JSON
`;
      }
    }
    
    // If we hit the step limit
    if (!done && stepCount >= maxSteps) {
      toolCalls.push({
        error: `Reached maximum conversation steps (${maxSteps})`,
        timestamp: new Date().toISOString(),
        latencyMs: 0
      });
    }
    
    return toolCalls;
  }
  
  /**
   * Build enhanced tool documentation with examples for agent mode
   */
  private buildEnhancedToolDocs(tools: any[], environment: string): string {
    return tools.map(tool => {
      // Extract parameter information
      const parameterInfo = tool.parameters ? 
        this.extractRequiredParams(tool.parameters) : 
        "No parameters required";
      
      // Create example for specific tools
      let exampleBlock = '';
      if (tool.name === 'run_query') {
        exampleBlock = `
Example:
\`\`\`json
{
  "environment": "${environment}",
  "dataset": "frontend", 
  "calculations": [
    {"op": "COUNT"},
    {"op": "AVG", "column": "duration_ms"}
  ],
  "breakdowns": ["service.name"],
  "time_range": 3600,
  "filters": [
    {"column": "duration_ms", "op": ">", "value": 0}
  ]
}
\`\`\`
`;
      } else if (tool.name === 'get_columns') {
        exampleBlock = `
Example:
\`\`\`json
{
  "environment": "${environment}",
  "dataset": "frontend"
}
\`\`\`
`;
      } else if (tool.name === 'analyze_column') {
        exampleBlock = `
Example:
\`\`\`json
{
  "environment": "${environment}",
  "dataset": "frontend",
  "column": "duration_ms"
}
\`\`\`
`;
      }
      
      return `
## ${tool.name}
${tool.description || 'No description available'}

Required Parameters:
${parameterInfo}
${exampleBlock}
`;
    }).join('\n');
  }

  /**
   * Run agent mode with structured thinking and goal-directed behavior
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
    
    // Build enhanced tool documentation with examples
    const toolDocs = this.buildEnhancedToolDocs(toolsResult.tools, environment);
    
    // Set up tracking
    const toolCalls: any[] = [];
    const maxSteps = prompt.maxSteps || 8;
    
    // Initialize agent context with thoughtful structure
    let agentContext = `
You are an AI agent performing data analysis on a Honeycomb environment. Your goal is to use the available tools to analyze data and reach specific insights.

GOAL:
${prompt.prompt}

AVAILABLE TOOLS:
${toolDocs}

IMPORTANT CONTEXT:
- You are working with the environment: "${environment}"
- Always include the "environment" parameter with value "${environment}" in your tool calls
- Think step-by-step about what information you need and how to get it
- Each tool call should build upon previous information
- Explain your thought process at each step
`;

    if (prompt.context) {
      agentContext += `\n\nADDITIONAL CONTEXT:\n${prompt.context}\n`;
    }

    // Instructions for agent's structured thinking
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

Note: For the final summary, you can either provide a simple string or a structured array of items as shown above, whichever is more appropriate for the task.
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
          
          // Add detailed guidance to the agent context to help fix the error
          agentContext += `\n\n## Error in Step ${stepCount}:
Error: ${parseError.message || 'Unknown error'}
${errorContext}

Please fix your JSON format. Common issues include:
1. Missing or extra commas between properties
2. Missing quotes around property names or string values
3. Trailing commas at the end of objects or arrays
4. Unescaped quotes or special characters in strings

Try again with valid JSON formatting.
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
          
          // Add guidance to the agent context
          agentContext += `\n\n## Error in Step ${stepCount}:
Error: No valid JSON found in your response.

Remember to format your response as JSON within triple backticks:
\`\`\`json
{
  "thought": "...",
  "plan": "...",
  "action": {
    "tool": "tool_name",
    "parameters": { ... }
  },
  "reasoning": "..."
}
\`\`\`

Try again with valid JSON formatting.
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
        
        // Special handling for query parameters
        let processedParameters = { ...parameters };
        if (tool === 'run_query') {
          processedParameters = this.ensureValidQueryParameters(processedParameters);
        }
        
        if (this.verbose) {
          console.log(`[Agent Step ${stepCount}] Calling tool ${tool} with params`, processedParameters);
        } else {
          console.log(`[Agent Step ${stepCount}] ${tool}`);
        }
        
        // Execute tool call
        const callStartTime = Date.now();
        let response;
        try {
          response = await this.client.callTool({
            name: tool,
            arguments: processedParameters
          });
        } catch (error) {
          response = { error: error instanceof Error ? error.message : String(error) };
        }
        const callEndTime = Date.now();
        
        // Record the tool call with thought process
        const toolCall = {
          step: stepCount,
          tool,
          parameters: processedParameters,
          thought: parsedResponse.thought,
          plan: parsedResponse.plan,
          reasoning: parsedResponse.reasoning,
          response,
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: callEndTime - callStartTime
        };
        
        toolCalls.push(toolCall);
        
        // Update agent context with result and guidance
        agentContext += `\n\n## Step ${stepCount} Results:
YOUR THOUGHT: ${parsedResponse.thought}
YOUR PLAN: ${parsedResponse.plan}
YOUR REASONING: ${parsedResponse.reasoning}
TOOL CALLED: ${tool}
PARAMETERS: ${JSON.stringify(processedParameters, null, 2)}
TOOL RESPONSE: ${JSON.stringify(response, null, 2)}

Now analyze this information and determine your next step. Remember to:
1. Build directly on what you've just learned
2. Progress toward your overall goal
3. Explain your thinking process clearly
4. When you've completed your analysis, make sure to provide a structured summary
`;
      } catch (error) {
        // Handle JSON parsing or other errors
        toolCalls.push({
          error: `Error in agent step ${stepCount}: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString(),
          latencyMs: 0
        });
        
        // Update context with error guidance
        agentContext += `\n\n## Error in Step ${stepCount}:
Error: ${error instanceof Error ? error.message : String(error)}

This might be because:
- The JSON format was incorrect
- The tool name was invalid
- Required parameters were missing

Try again with valid JSON formatting and ensure you're using the correct tool name and parameters.
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
  
  /**
   * Extract required parameters information from a JSON Schema
   */
  private extractRequiredParams(parameters: any): string {
    try {
      // If we have a properties object and required array
      if (parameters.properties && parameters.required) {
        const requiredParams = parameters.required;
        const paramDescriptions: string[] = [];
        
        // For each property, check if it's required
        for (const [name, details] of Object.entries(parameters.properties as Record<string, {type?: string; description?: string}>)) {
          const isRequired = requiredParams.includes(name);
          const type = details.type || 'any';
          const description = details.description || '';
          
          paramDescriptions.push(
            `- ${name}${isRequired ? ' (REQUIRED)' : ''}: ${type} - ${description}`
          );
        }
        
        return paramDescriptions.join('\n');
      }
      
      // Fallback to just stringifying the schema
      return JSON.stringify(parameters, null, 2);
    } catch (error) {
      return "Unable to parse parameters";
    }
  }
  
  /**
   * Ensure query parameters are valid for the run_query tool
   */
  private ensureValidQueryParameters(parameters: any): any {
    const processedParams = { ...parameters };
    
    // Ensure calculations is always an array
    if (!processedParams.calculations) {
      processedParams.calculations = [{ op: "COUNT" }];
    } else if (!Array.isArray(processedParams.calculations)) {
      processedParams.calculations = [processedParams.calculations];
    }
    
    // For MAX, AVG, etc. operations, ensure they have a column specified
    processedParams.calculations = processedParams.calculations.map((calc: any) => {
      if (calc.op && !calc.column && calc.field) {
        // Some models might use 'field' instead of 'column'
        return { ...calc, column: calc.field };
      }
      
      // Simple defaults for common operations that require a column
      if (calc.op && ['MAX', 'MIN', 'AVG', 'SUM', 'P95', 'P99'].includes(calc.op) && !calc.column) {
        if (parameters.groupBy?.[0] || parameters.breakdowns?.[0]) {
          // Use the first group-by field if available
          const firstField = parameters.groupBy?.[0] || parameters.breakdowns?.[0];
          return { ...calc, column: firstField };
        } else {
          // Default to a standard duration column if we can't determine anything else
          return { ...calc, column: 'duration_ms' };
        }
      }
      
      return calc;
    });
    
    // Ensure time_range is present
    if (!processedParams.time_range && !processedParams.start_time && !processedParams.end_time) {
      processedParams.time_range = 3600; // Default to last hour
    }
    
    // Standardize parameter names
    if (processedParams.groupBy && !processedParams.breakdowns) {
      processedParams.breakdowns = processedParams.groupBy;
      delete processedParams.groupBy;
    }
    
    if (processedParams.order && !processedParams.orders) {
      processedParams.orders = processedParams.order;
      delete processedParams.order;
    }
    
    // Validate and fix orders format 
    if (processedParams.orders && !Array.isArray(processedParams.orders)) {
      processedParams.orders = [processedParams.orders];
    }
    
    // Fix any orders that reference calculations
    if (processedParams.orders && Array.isArray(processedParams.orders)) {
      processedParams.orders = processedParams.orders.map((order: any) => {
        if (!order.op && order.column) {
          // Try to match with a calculation
          const matchingCalc = processedParams.calculations.find((calc: any) => 
            calc.column === order.column
          );
          if (matchingCalc) {
            return { 
              op: matchingCalc.op, 
              column: matchingCalc.column,
              order: order.order || 'descending'
            };
          }
        }
        return order;
      });
    }
    
    // Ensure query key is moved to top level if present
    if (processedParams.query) {
      // Merge query properties into top level
      for (const [key, value] of Object.entries(processedParams.query)) {
        if (!processedParams[key]) {
          processedParams[key] = value;
        }
      }
      delete processedParams.query;
    }
    
    return processedParams;
  }

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
          console.log(`Running evaluations with provider: ${provider.name}, model: ${modelName}`);
          
          // Use Promise.all with a limitation on concurrency
          const batchSize = this.config.concurrency;
          for (let i = 0; i < prompts.length; i += batchSize) {
            const batch = prompts.slice(i, i + batchSize);
            const batchPromises = batch.map(async (prompt: EvalPrompt) => {
              // Type guard for prompt.id
              if (!prompt.id) {
                console.warn('Warning: Prompt missing ID, generating fallback ID');
                // @ts-ignore - we handle missing ID in runEvaluation
              }
              return this.runEvaluation(prompt, provider, modelName);
            });
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
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