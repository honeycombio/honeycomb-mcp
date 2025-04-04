import fs from 'fs/promises';
import path from 'path';
import { EvalPrompt, EvalResult, EvalSummary, LLMProvider } from './types.js';
import { Client as MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';

interface RunnerConfig {
  promptsDir: string;
  resultsDir: string;
  providers: LLMProvider[];
  selectedModels: Map<string, string[]>; // provider name -> array of model names
  serverCommandLine?: string; // Command to start the MCP server
  serverUrl?: string; // Optional URL for HTTP-based connections
  concurrency: number;
}

export class EvalRunner {
  private config: RunnerConfig;
  private results: EvalResult[] = [];
  private client: MCPClient | null = null;
  private serverProcess: ChildProcess | null = null;

  constructor(config: RunnerConfig) {
    this.config = config;
  }

  /**
   * Set up the MCP client, either via stdio or HTTP
   */
  async setupClient(): Promise<void> {
    if (this.client) {
      return; // Already set up
    }

    if (this.config.serverCommandLine) {
      console.log(`Starting MCP server with command: ${this.config.serverCommandLine}`);
      
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
      
      console.log(`Parsed command: ${command}, args:`, args);
      
      // Create client
      this.client = new MCPClient({
        name: "honeycomb-mcp-eval",
        version: "1.0.0"
      });
      
      // Create a StdioClientTransport with the command and args
      // This will handle spawning the process internally
      const transport = new StdioClientTransport({
        command,
        args
      });
      
      // Connect to the server
      await this.client.connect(transport);
      
      // Store the process reference for cleanup later
      // @ts-ignore - accessing private property, but we need it for cleanup
      this.serverProcess = transport._process;
      console.log('Connected to MCP server via stdio');
      
      // List available tools for verification
      const toolsResult = await this.client.listTools();
      console.log(`Available tools (${toolsResult.tools.length}):`, 
        toolsResult.tools.map(t => t.name).join(', '));
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
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
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
    
    const startTime = Date.now();
    
    try {
      let toolResponse: any = null;
      let toolCalls: any[] = [];
      
      // Handle different evaluation modes
      if (prompt.conversationMode) {
        // Conversation mode: LLM-directed multiple tool calls
        toolCalls = await this.runConversationMode(prompt, provider, modelName);
      } else if (prompt.steps && prompt.steps.length > 0) {
        // Multi-step mode: Pre-defined sequence of tool calls
        toolCalls = await this.runMultiStepMode(prompt.steps);
      } else if (prompt.tool && prompt.parameters) {
        // Single tool mode: Legacy behavior
        console.log(`Calling tool ${prompt.tool} with params`, prompt.parameters);
        const callStartTime = Date.now();
        toolResponse = await this.client.callTool({
          name: prompt.tool,
          arguments: prompt.parameters
        });
        const callEndTime = Date.now();
        
        // Still record the call for consistency
        toolCalls = [{
          tool: prompt.tool,
          parameters: prompt.parameters,
          response: toolResponse,
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: callEndTime - callStartTime
        }];
      } else {
        throw new Error('Invalid prompt configuration: Must specify either tool, steps, or enable conversationMode');
      }
      
      const endTime = Date.now();
      
      // Create validation prompt with all tool calls
      const validationPrompt = this.createValidationPrompt(prompt, toolCalls, toolResponse);
      
      const validationResponse = await provider.runPrompt(validationPrompt, modelName);
      
      // Parse validation response
      const scoreMatch = validationResponse.match(/SCORE:\s*([\d.]+)/);
      const passedMatch = validationResponse.match(/PASSED:\s*(true|false)/i);
      const reasoningMatch = validationResponse.match(/REASONING:\s*([\s\S]+)/);
      
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
      const passed = passedMatch ? passedMatch[1].toLowerCase() === 'true' : false;
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : validationResponse;
      
      const tokenUsage = provider.getTokenUsage();
      
      // Create result object with appropriate fields
      const result: EvalResult = {
        id: prompt.id,
        timestamp: new Date().toISOString(),
        prompt,
        toolCalls,
        validation: {
          passed,
          score,
          reasoning
        },
        metrics: {
          startTime,
          endTime,
          latencyMs: endTime - startTime,
          tokenUsage,
          toolCallCount: toolCalls.length,
          stepCount: prompt.conversationMode ? toolCalls.length : undefined
        },
        provider: provider.name,
        model: modelName
      };
      
      // For backward compatibility
      if (toolResponse !== null) {
        result.toolResponse = toolResponse;
      }
      
      return result;
    } catch (error) {
      const endTime = Date.now();
      
      return {
        id: prompt.id,
        timestamp: new Date().toISOString(),
        prompt,
        toolResponse: { error: error.message },
        toolCalls: [],
        validation: {
          passed: false,
          score: 0,
          reasoning: `Tool execution failed with error: ${error.message}`
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
  private createValidationPrompt(prompt: EvalPrompt, toolCalls: any[], singleToolResponse: any = null): string {
    let validationPrompt = '';
    
    // For single-tool mode with backward compatibility
    if (singleToolResponse !== null && prompt.tool && prompt.parameters) {
      validationPrompt = `
Tool: ${prompt.tool}
Parameters: ${JSON.stringify(prompt.parameters)}
Response: ${JSON.stringify(singleToolResponse)}
`;
    } 
    // For multi-step or conversation mode
    else {
      validationPrompt = `
Evaluation of ${toolCalls.length} tool call${toolCalls.length !== 1 ? 's' : ''}:

${toolCalls.map((call, index) => `
--- Tool Call ${index + 1} ---
Tool: ${call.tool}
Parameters: ${JSON.stringify(call.parameters)}
Response: ${JSON.stringify(call.response)}
`).join('\n')}
`;
    }
    
    validationPrompt += `
Validation instructions: ${prompt.validation.prompt}

Score this response (0-1) and explain your reasoning. Format your response as:
SCORE: [0-1 number]
PASSED: [true/false]
REASONING: [your detailed explanation]
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
    
    const toolCalls = [];
    const stepResults: Record<number, any> = {}; // Store results by step index for reference
    
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      const step = steps[stepIndex];
      
      // Expand parameters using previous step results
      console.log(`Step ${stepIndex}: Original parameters before expansion:`, JSON.stringify(step.parameters));
      const expandedParameters = this.expandStepParameters(step.parameters, stepResults);
      
      console.log(`Step ${stepIndex}: Calling tool ${step.tool} with expanded params:`, JSON.stringify(expandedParameters));
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
          response: { error: error.message },
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
            console.warn(`Warning: Path ${path} in step ${stepIndex} result returned null/undefined.`);
            console.log(`Available properties at step ${stepIndex}:`, Object.keys(stepResults[stepIndex]).join(', '));
            
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
    const toolCalls = [];
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
      
      // Ask LLM what tool to use
      const llmResponse = await provider.runPrompt(conversationContext, modelName);
      
      // Extract JSON from response
      const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        toolCalls.push({
          error: "LLM response did not contain valid JSON",
          response: llmResponse,
          timestamp: new Date().toISOString(),
          latencyMs: 0
        });
        break;
      }
      
      try {
        const parsedResponse = JSON.parse(jsonMatch[1]);
        
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
        
        console.log(`[Step ${stepCount}] Calling tool ${tool} with params`, processedParameters);
        
        const callStartTime = Date.now();
        const response = await this.client.callTool({
          name: tool,
          arguments: processedParameters
        });
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
          error: `Error in conversation step ${stepCount}: ${error.message}`,
          timestamp: new Date().toISOString(),
          latencyMs: 0
        });
        
        // Update context with error and more guidance
        conversationContext += `\n\n## Error in Step ${stepCount}:
Error: ${error.message}

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
   * Extract required parameters information from a JSON Schema
   */
  private extractRequiredParams(parameters: any): string {
    try {
      // If we have a properties object and required array
      if (parameters.properties && parameters.required) {
        const requiredParams = parameters.required;
        const paramDescriptions = [];
        
        // For each property, check if it's required
        for (const [name, details] of Object.entries(parameters.properties)) {
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
    processedParams.calculations = processedParams.calculations.map(calc => {
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
      processedParams.orders = processedParams.orders.map(order => {
        if (!order.op && order.column) {
          // Try to match with a calculation
          const matchingCalc = processedParams.calculations.find(calc => 
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
      
      // For each provider
      for (const provider of this.config.providers) {
        // Get models for this provider
        const providerModels = this.config.selectedModels.get(provider.name) || [provider.models[0]];
        
        // For each model for this provider
        for (const modelName of providerModels) {
          console.log(`Running evaluations with provider: ${provider.name}, model: ${modelName}`);
          
          // Use Promise.all with a limitation on concurrency
          const batchSize = this.config.concurrency;
          for (let i = 0; i < prompts.length; i += batchSize) {
            const batch = prompts.slice(i, i + batchSize);
            const batchResults = await Promise.all(
              batch.map(prompt => this.runEvaluation(prompt, provider, modelName))
            );
            results.push(...batchResults);
          }
        }
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
      
      const summary: EvalSummary = {
        timestamp: new Date().toISOString(),
        totalTests: results.length,
        passed,
        failed: results.length - passed,
        successRate: passed / results.length,
        averageLatency: results.reduce((sum, r) => sum + r.metrics.latencyMs, 0) / results.length,
        averageToolCalls,
        results,
        metadata: {
          providers: this.config.providers.map(p => p.name),
          models: Object.fromEntries(this.config.selectedModels.entries())
        }
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