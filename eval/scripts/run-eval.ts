import { EvalRunner } from './runner.js';
import path from 'path';
import fs from 'fs/promises';
import { LLMProvider } from './types.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

// OpenAI provider implementation
class OpenAIProvider implements LLMProvider {
  name = 'openai';
  models = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  private tokenCounts = { prompt: 0, completion: 0, total: 0 };
  private client: OpenAI;

  constructor(private apiKey: string) {
    this.client = new OpenAI({
      apiKey: this.apiKey
    });
  }

  async runPrompt(prompt: string, model: string): Promise<string> {
    try {
      console.log(`Running OpenAI prompt with model ${model}`);
      
      // Check if we're using a mock/demo key
      if (this.apiKey === 'demo-key') {
        // Mock response
        this.tokenCounts.prompt += prompt.length / 4;
        const response = "SCORE: 1\nPASSED: true\nREASONING: The tool returned the expected data format with dataset information.";
        this.tokenCounts.completion += response.length / 4;
        this.tokenCounts.total = this.tokenCounts.prompt + this.tokenCounts.completion;
        return response;
      }
      
      // Real API call
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are an evaluation assistant that reviews tool responses and determines if they meet criteria. Format your response as SCORE: [0-1 number], PASSED: [true/false], REASONING: [your detailed explanation].' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      });
      
      // Update token counts
      this.tokenCounts.prompt += response.usage?.prompt_tokens || 0;
      this.tokenCounts.completion += response.usage?.completion_tokens || 0;
      this.tokenCounts.total = this.tokenCounts.prompt + this.tokenCounts.completion;
      
      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('OpenAI API error:', error);
      return `SCORE: 0\nPASSED: false\nREASONING: Error calling OpenAI API: ${error.message}`;
    }
  }

  getTokenUsage() {
    return { ...this.tokenCounts };
  }
}

// Anthropic provider implementation
class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  models = ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest'];
  private tokenCounts = { prompt: 0, completion: 0, total: 0 };
  private client: Anthropic;

  constructor(private apiKey: string) {
    this.client = new Anthropic({
      apiKey: this.apiKey
    });
  }

  async runPrompt(prompt: string, model: string): Promise<string> {
    try {
      console.log(`Running Anthropic prompt with model ${model}`);
      
      // Check if we're using a mock/demo key
      if (this.apiKey === 'demo-key') {
        // Mock response
        this.tokenCounts.prompt += prompt.length / 4;
        const response = "SCORE: 0.9\nPASSED: true\nREASONING: The tool response contains the expected dataset information with all required fields.";
        this.tokenCounts.completion += response.length / 4;
        this.tokenCounts.total = this.tokenCounts.prompt + this.tokenCounts.completion;
        return response;
      }
      
      // System prompt for evaluation
      const systemPrompt = 'You are an evaluation assistant that reviews tool responses and determines if they meet criteria. Format your response as SCORE: [0-1 number], PASSED: [true/false], REASONING: [your detailed explanation].';
      
      // Real API call
      const response = await this.client.messages.create({
        model,
        system: systemPrompt,
        max_tokens: 1000,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      });
      
      // Update token counts
      this.tokenCounts.prompt += response.usage?.input_tokens || 0;
      this.tokenCounts.completion += response.usage?.output_tokens || 0;
      this.tokenCounts.total = this.tokenCounts.prompt + this.tokenCounts.completion;
      
      return response.content[0].text;
    } catch (error) {
      console.error('Anthropic API error:', error);
      return `SCORE: 0\nPASSED: false\nREASONING: Error calling Anthropic API: ${error.message}`;
    }
  }

  getTokenUsage() {
    return { ...this.tokenCounts };
  }
}

async function generateReport(summaryPath: string, outputPath: string): Promise<void> {
  // Ensure reports directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const summaryData = await fs.readFile(summaryPath, 'utf-8');
  const summary = JSON.parse(summaryData);
  
  // Generate a simple HTML report
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Honeycomb MCP Evaluation Report</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #F5A623; border-bottom: 2px solid #F5A623; padding-bottom: 10px; }
    h2 { color: #F5A623; margin-top: 30px; }
    .summary { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
    .stat { text-align: center; }
    .stat .value { font-size: 2em; font-weight: bold; margin: 10px 0; }
    .stat .label { font-size: 0.9em; color: #666; }
    .success { color: #28a745; }
    .failure { color: #dc3545; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
    th { background-color: #f5f5f5; }
    tr:hover { background-color: #f1f1f1; }
    .result-details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 10px; }
    .code { font-family: monospace; background: #f0f0f0; padding: 10px; border-radius: 3px; white-space: pre-wrap; }
    .token-usage { margin-top: 10px; font-size: 0.9em; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Honeycomb MCP Evaluation Report</h1>
    <p>Generated on: ${new Date(summary.timestamp).toLocaleString()}</p>
    
    <div class="summary">
      <h2>Summary</h2>
      <div class="summary-grid">
        <div class="stat">
          <div class="label">Total Tests</div>
          <div class="value">${summary.totalTests}</div>
        </div>
        <div class="stat">
          <div class="label">Passed</div>
          <div class="value success">${summary.passed}</div>
        </div>
        <div class="stat">
          <div class="label">Failed</div>
          <div class="value failure">${summary.failed}</div>
        </div>
        <div class="stat">
          <div class="label">Success Rate</div>
          <div class="value">${(summary.successRate * 100).toFixed(1)}%</div>
        </div>
        <div class="stat">
          <div class="label">Avg Latency</div>
          <div class="value">${summary.averageLatency.toFixed(0)}ms</div>
        </div>
      </div>
    </div>
    
    <h2>Results by Tool</h2>
    <table>
      <thead>
        <tr>
          <th>Tool</th>
          <th>Test ID</th>
          <th>Provider / Model</th>
          <th>Status</th>
          <th>Score</th>
          <th>Latency</th>
        </tr>
      </thead>
      <tbody>
        ${summary.results.map(result => `
          <tr>
            <td>${result.prompt.tool}</td>
            <td>${result.id}</td>
            <td>${result.provider} / ${result.model}</td>
            <td class="${result.validation.passed ? 'success' : 'failure'}">${result.validation.passed ? 'PASS' : 'FAIL'}</td>
            <td>${result.validation.score !== undefined ? result.validation.score.toFixed(2) : 'N/A'}</td>
            <td>${result.metrics.latencyMs}ms</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <h2>Detailed Results</h2>
    ${summary.results.map(result => `
      <div class="result-details">
        <h3>${result.id} (${result.prompt.tool})</h3>
        <p><strong>Provider/Model:</strong> ${result.provider}/${result.model}</p>
        <p><strong>Status:</strong> <span class="${result.validation.passed ? 'success' : 'failure'}">${result.validation.passed ? 'PASS' : 'FAIL'}</span></p>
        <p><strong>Score:</strong> ${result.validation.score !== undefined ? result.validation.score.toFixed(2) : 'N/A'}</p>
        <p><strong>Validation Reasoning:</strong> ${result.validation.reasoning}</p>
        
        ${result.metrics.tokenUsage?.total ? `
        <div class="token-usage">
          <strong>Token Usage:</strong> 
          Prompt: ${result.metrics.tokenUsage.prompt || 0} | 
          Completion: ${result.metrics.tokenUsage.completion || 0} | 
          Total: ${result.metrics.tokenUsage.total || 0}
        </div>
        ` : ''}
        
        <details>
          <summary>Tool Response</summary>
          <div class="code">${JSON.stringify(result.toolResponse, null, 2)}</div>
        </details>
        <details>
          <summary>Prompt Details</summary>
          <div class="code">${JSON.stringify(result.prompt, null, 2)}</div>
        </details>
      </div>
    `).join('')}
  </div>
</body>
</html>
  `;
  
  await fs.writeFile(outputPath, html, 'utf-8');
  console.log(`Report generated at: ${outputPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Load environment variables from root .env file
  try {
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
    console.log('Loaded environment variables from .env file');
  } catch (error) {
    console.log('No .env file found or error loading it, will use environment variables if available');
  }
  
  if (command === 'run') {
    // Load environment variables for API keys
    const openaiApiKey = process.env.OPENAI_API_KEY || 'demo-key';
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY || 'demo-key';
    
    // Determine which providers to use based on available API keys
    const providers = [];
    if (openaiApiKey && openaiApiKey !== 'demo-key') {
      providers.push(new OpenAIProvider(openaiApiKey));
      console.log('Added OpenAI provider with API key');
    }
    if (anthropicApiKey && anthropicApiKey !== 'demo-key') {
      providers.push(new AnthropicProvider(anthropicApiKey));
      console.log('Added Anthropic provider with API key');
    }
    
    // Fallback if no API keys are available
    if (providers.length === 0) {
      console.log('No valid API keys available, using mock providers');
      providers.push(new OpenAIProvider('demo-key'));
      providers.push(new AnthropicProvider('demo-key'));
    }
    
    // Select models to use (could be from config or args)
    // Parse from JSON string in env var if available
    // This can be either a string or an array of strings for each provider
    let selectedModels = new Map([
      ['openai', ['gpt-4o']],
      ['anthropic', ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest']]
    ]);
    
    if (process.env.EVAL_MODELS) {
      try {
        const modelConfig = JSON.parse(process.env.EVAL_MODELS);
        
        // Convert the modelConfig to a Map with arrays of models
        const modelMap = new Map();
        for (const [provider, models] of Object.entries(modelConfig)) {
          if (Array.isArray(models)) {
            modelMap.set(provider, models);
          } else {
            modelMap.set(provider, [models]);
          }
        }
        
        selectedModels = modelMap;
        console.log('Using models from environment config:', 
          Object.fromEntries(selectedModels.entries()));
      } catch (error) {
        console.error('Error parsing EVAL_MODELS env var:', error);
      }
    }
    
    // Get concurrency from env or default to 2
    const concurrency = parseInt(process.env.EVAL_CONCURRENCY || '2', 10);
    
    // Configuration for runner
    const runnerConfig: any = {
      promptsDir: path.resolve('eval/prompts'),
      resultsDir: path.resolve('eval/results'),
      providers,
      selectedModels,
      concurrency
    };
    
    // For stdio-based MCP connection
    if (process.env.MCP_SERVER_COMMAND) {
      console.log(`Using MCP server command: ${process.env.MCP_SERVER_COMMAND}`);
      runnerConfig.serverCommandLine = process.env.MCP_SERVER_COMMAND;
    } 
    // For HTTP-based MCP connection
    else if (process.env.MCP_SERVER_URL) {
      console.log(`Using MCP server URL: ${process.env.MCP_SERVER_URL}`);
      runnerConfig.serverUrl = process.env.MCP_SERVER_URL;
    }
    // Default for local development
    else {
      console.log('Using default node build/index.mjs command');
      runnerConfig.serverCommandLine = 'node build/index.mjs';
    }
    
    const runner = new EvalRunner(runnerConfig);
    
    console.log('Starting evaluation run...');
    const summary = await runner.runAll();
    
    // Save summary
    const summaryPath = path.resolve(`eval/results/summary-${new Date().toISOString().replace(/[:\.]/g, '-')}.json`);
    await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`Evaluation complete. Summary saved to ${summaryPath}`);
    
    // Generate report
    const reportPath = path.resolve(`eval/reports/report-${new Date().toISOString().replace(/[:\.]/g, '-')}.html`);
    await generateReport(summaryPath, reportPath);
  } else if (command === 'report' && args[1]) {
    const summaryPath = args[1];
    const reportPath = path.resolve(`eval/reports/report-${new Date().toISOString().replace(/[:\.]/g, '-')}.html`);
    await generateReport(summaryPath, reportPath);
  } else {
    console.log(`
Usage:
  run-eval run                    Run all evaluations
  run-eval report [summary-path]  Generate report from a summary file
    `);
  }
}

main().catch(console.error);