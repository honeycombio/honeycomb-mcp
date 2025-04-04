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
   * Run a pre-defined sequence of tool calls
   */
  private async runMultiStepMode(steps: any[]): Promise<any[]> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }
    
    const toolCalls = [];
    
    for (const step of steps) {
      console.log(`Calling tool ${step.tool} with params`, step.parameters);
      const callStartTime = Date.now();
      
      try {
        const response = await this.client.callTool({
          name: step.tool,
          arguments: step.parameters
        });
        
        const callEndTime = Date.now();
        
        toolCalls.push({
          tool: step.tool,
          parameters: step.parameters,
          response,
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: callEndTime - callStartTime
        });
      } catch (error) {
        // Record the error but continue with next steps
        toolCalls.push({
          tool: step.tool,
          parameters: step.parameters,
          response: { error: error.message },
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: Date.now() - callStartTime
        });
      }
    }
    
    return toolCalls;
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
   */
  private async runConversationMode(prompt: EvalPrompt, provider: LLMProvider, modelName: string): Promise<any[]> {
    if (!this.client) {
      throw new Error('MCP client not initialized');
    }
    
    // Get available tools
    const toolsResult = await this.client.listTools();
    const availableTools = toolsResult.tools.map(t => ({
      name: t.name,
      description: t.description || 'No description available',
      parameters: t.parameters || {}
    }));
    
    // Set up conversation tracking
    const toolCalls = [];
    const maxSteps = prompt.maxSteps || 5; // Default to 5 if not specified
    let conversationContext = `
You are performing a task for evaluation. Your goal is to use the available tools to accomplish the task.
${prompt.prompt}

Available tools:
${availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n')}

When you want to use a tool, respond in the following format:
\`\`\`json
{
  "tool": "tool_name",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  }
}
\`\`\`

After you receive the tool response, you can either:
1. Use another tool by responding in the same JSON format
2. Indicate you're done by responding with:
\`\`\`json
{ "done": true, "explanation": "Your explanation of how you accomplished the task" }
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
        const { tool, parameters } = parsedResponse;
        console.log(`[Step ${stepCount}] Calling tool ${tool} with params`, parameters);
        
        const callStartTime = Date.now();
        const response = await this.client.callTool({
          name: tool,
          arguments: parameters
        });
        const callEndTime = Date.now();
        
        // Record the tool call
        const toolCall = {
          tool,
          parameters,
          response,
          timestamp: new Date(callStartTime).toISOString(),
          latencyMs: callEndTime - callStartTime
        };
        toolCalls.push(toolCall);
        
        // Update conversation context
        conversationContext += `\n\nYou called tool: ${tool}
Parameters: ${JSON.stringify(parameters)}
Tool response: ${JSON.stringify(response)}

What would you like to do next?`;
        
      } catch (error) {
        // Handle errors in the conversation
        toolCalls.push({
          error: `Error in conversation step ${stepCount}: ${error.message}`,
          timestamp: new Date().toISOString(),
          latencyMs: 0
        });
        
        // Update context with error
        conversationContext += `\n\nError: ${error.message}\nPlease try again or try a different tool.`;
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