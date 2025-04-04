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
      // Call the MCP tool
      console.log(`Calling tool ${prompt.tool} with params`, prompt.parameters);
      const toolResponse = await this.client.callTool({
        name: prompt.tool,
        arguments: prompt.parameters
      });
      
      const endTime = Date.now();
      
      // Validate the response using an LLM
      const validationPrompt = `
Tool: ${prompt.tool}
Parameters: ${JSON.stringify(prompt.parameters)}
Response: ${JSON.stringify(toolResponse)}

Validation instructions: ${prompt.validation.prompt}

Score this response (0-1) and explain your reasoning. Format your response as:
SCORE: [0-1 number]
PASSED: [true/false]
REASONING: [your detailed explanation]
      `;
      
      const validationResponse = await provider.runPrompt(validationPrompt, modelName);
      
      // Parse validation response
      const scoreMatch = validationResponse.match(/SCORE:\s*([\d.]+)/);
      const passedMatch = validationResponse.match(/PASSED:\s*(true|false)/i);
      const reasoningMatch = validationResponse.match(/REASONING:\s*([\s\S]+)/);
      
      const score = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
      const passed = passedMatch ? passedMatch[1].toLowerCase() === 'true' : false;
      const reasoning = reasoningMatch ? reasoningMatch[1].trim() : validationResponse;
      
      const tokenUsage = provider.getTokenUsage();
      
      return {
        id: prompt.id,
        timestamp: new Date().toISOString(),
        prompt,
        toolResponse,
        validation: {
          passed,
          score,
          reasoning
        },
        metrics: {
          startTime,
          endTime,
          latencyMs: endTime - startTime,
          tokenUsage
        },
        provider: provider.name,
        model: modelName
      };
    } catch (error) {
      const endTime = Date.now();
      
      return {
        id: prompt.id,
        timestamp: new Date().toISOString(),
        prompt,
        toolResponse: { error: error.message },
        validation: {
          passed: false,
          score: 0,
          reasoning: `Tool execution failed with error: ${error.message}`
        },
        metrics: {
          startTime,
          endTime,
          latencyMs: endTime - startTime,
          tokenUsage: { prompt: 0, completion: 0, total: 0 }
        },
        provider: provider.name,
        model: modelName
      };
    }
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
      
      const summary: EvalSummary = {
        timestamp: new Date().toISOString(),
        totalTests: results.length,
        passed,
        failed: results.length - passed,
        successRate: passed / results.length,
        averageLatency: results.reduce((sum, r) => sum + r.metrics.latencyMs, 0) / results.length,
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