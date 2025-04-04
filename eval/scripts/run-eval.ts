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
  models = ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest', 'claude-3-opus-latest'];
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

async function generateReportIndex(reportsDir: string): Promise<void> {
  // Ensure reports directory exists
  await fs.mkdir(reportsDir, { recursive: true });
  
  // Get all report files
  const files = await fs.readdir(reportsDir);
  const reportFiles = files.filter(file => file.startsWith('report-') && file.endsWith('.html'));
  
  // Sort by date (newest first)
  reportFiles.sort((a, b) => {
    return b.localeCompare(a);
  });
  
  // Create index.html
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Honeycomb MCP Evaluation Reports</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #F5A623; border-bottom: 2px solid #F5A623; padding-bottom: 10px; }
    ul { list-style-type: none; padding: 0; }
    li { margin: 10px 0; padding: 10px; border-bottom: 1px solid #eee; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .date { color: #666; font-size: 0.9em; }
    .latest { background: #fffbf4; border-left: 3px solid #F5A623; padding-left: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Honeycomb MCP Evaluation Reports</h1>
    <p>Select a report to view detailed evaluation results:</p>
    
    <ul>
      ${reportFiles.map((file, index) => {
        const isLatest = index === 0;
        const dateMatch = file.match(/report-(.+)\.html/);
        const dateStr = dateMatch ? dateMatch[1].replace(/-/g, ':').replace('T', ' ').substr(0, 19) : 'Unknown date';
        
        return `
      <li class="${isLatest ? 'latest' : ''}">
        <a href="${file}">${isLatest ? '📊 Latest: ' : ''}Report from ${dateStr}</a>
        ${isLatest ? '<small>(This is the most recent evaluation run)</small>' : ''}
      </li>`;
      }).join('')}
    </ul>
  </div>
</body>
</html>
  `;
  
  await fs.writeFile(path.join(reportsDir, 'index.html'), html, 'utf-8');
  console.log(`Report index generated at: ${path.join(reportsDir, 'index.html')}`);
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
    .result-details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 30px; border: 1px solid #eaeaea; }
    .code { font-family: monospace; background: #f0f0f0; padding: 10px; border-radius: 3px; white-space: pre-wrap; }
    .token-usage { margin-top: 10px; font-size: 0.9em; color: #666; }
    .tool-calls { margin-top: 20px; }
    .tool-call { margin-bottom: 15px; padding: 10px; border-left: 3px solid #F5A623; background: #fffbf4; }
    .multi-step-label { background: #f0f8ff; border-radius: 3px; padding: 3px 6px; color: #0066cc; font-size: 0.8em; margin-left: 8px; }
    .conversation-label { background: #f0fff0; border-radius: 3px; padding: 3px 6px; color: #008800; font-size: 0.8em; margin-left: 8px; }
    .badge { display: inline-block; padding: 0.25em 0.4em; font-size: 75%; font-weight: 700; line-height: 1; text-align: center; white-space: nowrap; vertical-align: baseline; border-radius: 0.25rem; }
    .back-to-top { display: block; text-align: right; margin: 10px 0; font-size: 0.9em; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    nav { position: sticky; top: 0; background: #fff; padding: 10px 0; border-bottom: 1px solid #eee; margin-bottom: 20px; z-index: 100; }
    nav a { margin-right: 15px; font-weight: bold; }
    .page-section { scroll-margin-top: 60px; }
  </style>
</head>
<body>
  <div class="container">
    <nav>
      <a href="#summary">Summary</a>
      <a href="#results-table">Results Table</a>
      <a href="#detailed-results">Detailed Results</a>
    </nav>
    
    <h1>Honeycomb MCP Evaluation Report</h1>
    <p>Generated on: ${new Date(summary.timestamp).toLocaleString()}</p>
    
    <div id="summary" class="summary page-section">
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
        <div class="stat">
          <div class="label">Avg Tool Calls</div>
          <div class="value">${summary.averageToolCalls ? summary.averageToolCalls.toFixed(1) : 'N/A'}</div>
        </div>
      </div>
    </div>
    
    <h2 id="results-table" class="page-section">Results by Test</h2>
    <table>
      <thead>
        <tr>
          <th>Test ID</th>
          <th>Type</th>
          <th>Provider / Model</th>
          <th>Tool Calls</th>
          <th>Status</th>
          <th>Score</th>
          <th>Latency</th>
        </tr>
      </thead>
      <tbody>
        ${summary.results.map(result => `
          <tr>
            <td><a href="#test-${result.id}-${result.provider}-${result.model.replace(/[^a-zA-Z0-9-]/g, '_')}">${result.id}</a></td>
            <td>
              ${result.prompt.conversationMode 
                ? `<span class="badge conversation-label">Conversation</span>` 
                : result.prompt.steps && result.prompt.steps.length > 0 
                  ? `<span class="badge multi-step-label">Multi-step</span>` 
                  : `<span class="badge">Single</span>`}
            </td>
            <td>${result.provider} / ${result.model}</td>
            <td>${result.metrics.toolCallCount || 1}</td>
            <td class="${result.validation.passed ? 'success' : 'failure'}">${result.validation.passed ? 'PASS' : 'FAIL'}</td>
            <td>${result.validation.score !== undefined ? result.validation.score.toFixed(2) : 'N/A'}</td>
            <td>${result.metrics.latencyMs}ms</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <h2 id="detailed-results" class="page-section">Detailed Results</h2>
    ${summary.results.map(result => `
      <div id="test-${result.id}-${result.provider}-${result.model.replace(/[^a-zA-Z0-9-]/g, '_')}" class="result-details">
        <h3>${result.id} ${
          result.prompt.conversationMode 
            ? `<span class="badge conversation-label">Conversation Mode</span>` 
            : result.prompt.steps && result.prompt.steps.length > 0 
              ? `<span class="badge multi-step-label">Multi-step</span>` 
              : ''
        }</h3>
        <p><strong>Provider/Model:</strong> ${result.provider}/${result.model}</p>
        <p><strong>Status:</strong> <span class="${result.validation.passed ? 'success' : 'failure'}">${result.validation.passed ? 'PASS' : 'FAIL'}</span></p>
        <p><strong>Score:</strong> ${result.validation.score !== undefined ? result.validation.score.toFixed(2) : 'N/A'}</p>
        <p><strong>Validation Reasoning:</strong> ${result.validation.reasoning}</p>
        <p><strong>Tool Calls:</strong> ${result.metrics.toolCallCount || 1}</p>
        
        ${result.metrics.tokenUsage?.total ? `
        <div class="token-usage">
          <strong>Token Usage:</strong> 
          Prompt: ${result.metrics.tokenUsage.prompt || 0} | 
          Completion: ${result.metrics.tokenUsage.completion || 0} | 
          Total: ${result.metrics.tokenUsage.total || 0}
        </div>
        ` : ''}
        
        ${result.toolCalls && result.toolCalls.length > 0 ? `
          <details>
            <summary>Tool Calls (${result.toolCalls.length})</summary>
            <div class="tool-calls">
              ${result.toolCalls.map((call, index) => `
                <div class="tool-call">
                  <h4>Call ${index + 1}: ${call.tool || 'N/A'}</h4>
                  <p><strong>Parameters:</strong></p>
                  <div class="code">${JSON.stringify(call.parameters || {}, null, 2)}</div>
                  <p><strong>Response:</strong></p>
                  <div class="code">${JSON.stringify(call.response || {}, null, 2)}</div>
                  <p><small>Latency: ${call.latencyMs || 0}ms</small></p>
                </div>
              `).join('')}
            </div>
          </details>
        ` : `
          <details>
            <summary>Tool Response</summary>
            <div class="code">${JSON.stringify(result.toolResponse, null, 2)}</div>
          </details>
        `}
        
        <details>
          <summary>Prompt Details</summary>
          <div class="code">${JSON.stringify(result.prompt, null, 2)}</div>
        </details>
        <a href="#results-table" class="back-to-top">Back to Results</a>
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
    const reportTimestamp = new Date().toISOString().replace(/[:\.]/g, '-');
    const reportPath = path.resolve(`eval/reports/report-${reportTimestamp}.html`);
    await generateReport(summaryPath, reportPath);
    
    // Generate or update an index.html that lists all reports
    await generateReportIndex(path.resolve('eval/reports'));
  } else if (command === 'report' && args[1]) {
    const summaryPath = args[1];
    const reportTimestamp = new Date().toISOString().replace(/[:\.]/g, '-');
    const reportPath = path.resolve(`eval/reports/report-${reportTimestamp}.html`);
    await generateReport(summaryPath, reportPath);
    
    // Update the index after generating a new report
    await generateReportIndex(path.resolve('eval/reports'));
  } else if (command === 'update-index') {
    await generateReportIndex(path.resolve('eval/reports'));
  } else {
    console.log(`
Usage:
  run-eval run                    Run all evaluations
  run-eval report [summary-path]  Generate report from a summary file
  run-eval update-index           Update the reports index.html file
    `);
  }
}

main().catch(console.error);