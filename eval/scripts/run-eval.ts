import { EvalRunner } from './runner.js';
import path from 'path';
import fs from 'fs/promises';
import { LLMProvider } from './types.js';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import mustache from 'mustache';

// Configuration interface
interface EvalConfig {
  judgeProvider: string;
  judgeModel: string;
}

// OpenAI provider implementation
class OpenAIProvider implements LLMProvider {
  name = 'openai';
  models = ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  
  // Track validation tokens (for judging)
  private tokenCounts = { prompt: 0, completion: 0, total: 0 };
  
  // Track tool usage tokens separately
  private toolTokenCounts = { toolPrompt: 0, toolCompletion: 0, toolTotal: 0 };
  
  // Flag to determine if a call is for validation or tool usage
  private isToolCall = false;
  
  private client: OpenAI;

  constructor(private apiKey: string) {
    this.client = new OpenAI({
      apiKey: this.apiKey
    });
  }

  // Set the context for token tracking
  setToolCallContext(isToolCall: boolean) {
    this.isToolCall = isToolCall;
  }

  async runPrompt(prompt: string, model: string): Promise<string> {
    try {
      // Determine if this is for tool usage or validation
      const isForTool = this.isToolCall;
      console.log(`Running OpenAI prompt with model ${model} ${isForTool ? '(for tool usage)' : '(for validation)'}`);
      
      // Different system prompts based on context
      const systemPrompt = isForTool ?
        'You are an assistant helping with data analysis. Use the tools available to analyze data and answer questions.' : 
        'You are an evaluation assistant that reviews tool responses and determines if they meet criteria. Format your response as SCORE: [0-1 number], PASSED: [true/false], REASONING: [your detailed explanation].';
      
      // Real API call
      const response = await this.client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      });
      
      // Update appropriate token counter based on context
      if (isForTool) {
        this.toolTokenCounts.toolPrompt += response.usage?.prompt_tokens || 0;
        this.toolTokenCounts.toolCompletion += response.usage?.completion_tokens || 0;
        this.toolTokenCounts.toolTotal = this.toolTokenCounts.toolPrompt + this.toolTokenCounts.toolCompletion;
      } else {
        this.tokenCounts.prompt += response.usage?.prompt_tokens || 0;
        this.tokenCounts.completion += response.usage?.completion_tokens || 0;
        this.tokenCounts.total = this.tokenCounts.prompt + this.tokenCounts.completion;
      }
      
      // Reset context after call
      this.isToolCall = false;
      
      return response.choices[0].message.content || '';
    } catch (error) {
      console.error('OpenAI API error:', error);
      return `SCORE: 0\nPASSED: false\nREASONING: Error calling OpenAI API: ${error.message}`;
    }
  }

  getTokenUsage() {
    return { 
      ...this.tokenCounts,
      ...this.toolTokenCounts
    };
  }
}

// Anthropic provider implementation
class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  models = ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest', 'claude-3-opus-latest'];
  
  // Track validation tokens (for judging)
  private tokenCounts = { prompt: 0, completion: 0, total: 0 };
  
  // Track tool usage tokens separately
  private toolTokenCounts = { toolPrompt: 0, toolCompletion: 0, toolTotal: 0 };
  
  // Flag to determine if a call is for validation or tool usage
  private isToolCall = false;
  
  private client: Anthropic;

  constructor(private apiKey: string) {
    this.client = new Anthropic({
      apiKey: this.apiKey
    });
  }

  // Set the context for token tracking
  setToolCallContext(isToolCall: boolean) {
    this.isToolCall = isToolCall;
  }

  async runPrompt(prompt: string, model: string): Promise<string> {
    try {
      // Determine if this is for tool usage or validation
      const isForTool = this.isToolCall;
      console.log(`Running Anthropic prompt with model ${model} ${isForTool ? '(for tool usage)' : '(for validation)'}`);
      
      // Different system prompts based on context
      const systemPrompt = isForTool ?
        'You are an assistant helping with data analysis. Use the tools available to analyze data and answer questions.' : 
        'You are an evaluation assistant that reviews tool responses and determines if they meet criteria. Format your response as SCORE: [0-1 number], PASSED: [true/false], REASONING: [your detailed explanation].';
      
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
      
      // Update appropriate token counter based on context
      if (isForTool) {
        this.toolTokenCounts.toolPrompt += response.usage?.input_tokens || 0;
        this.toolTokenCounts.toolCompletion += response.usage?.output_tokens || 0;
        this.toolTokenCounts.toolTotal = this.toolTokenCounts.toolPrompt + this.toolTokenCounts.toolCompletion;
      } else {
        this.tokenCounts.prompt += response.usage?.input_tokens || 0;
        this.tokenCounts.completion += response.usage?.output_tokens || 0;
        this.tokenCounts.total = this.tokenCounts.prompt + this.tokenCounts.completion;
      }
      
      // Reset context after call
      this.isToolCall = false;
      
      return response.content[0].text;
    } catch (error) {
      console.error('Anthropic API error:', error);
      return `SCORE: 0\nPASSED: false\nREASONING: Error calling Anthropic API: ${error.message}`;
    }
  }

  getTokenUsage() {
    return { 
      ...this.tokenCounts,
      ...this.toolTokenCounts
    };
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
  
  // Prepare template data
  const reports = reportFiles.map((file, index) => {
    const isLatest = index === 0;
    const dateMatch = file.match(/report-(.+)\.html/);
    const dateStr = dateMatch ? dateMatch[1].replace(/-/g, ':').replace('T', ' ').substr(0, 19) : 'Unknown date';
    
    return {
      filename: file,
      dateStr,
      isLatest
    };
  });
  
  // Load template
  const templatePath = path.join(process.cwd(), 'eval', 'templates', 'index.html');
  
  let template;
  try {
    template = await fs.readFile(templatePath, 'utf-8');
    console.log(`Loaded index template from ${templatePath}`);
  } catch (error) {
    console.error(`Error loading template from ${templatePath}:`, error);
    // Fall back to a basic template if the file doesn't exist
    template = `<!DOCTYPE html>
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
      {{#reports}}
      <li class="{{#isLatest}}latest{{/isLatest}}">
        <a href="{{filename}}">{{#isLatest}}📊 Latest: {{/isLatest}}Report from {{dateStr}}</a>
        {{#isLatest}}<small>(This is the most recent evaluation run)</small>{{/isLatest}}
      </li>
      {{/reports}}
    </ul>
  </div>
</body>
</html>`;
  }
  
  // Render template
  const html = mustache.render(template, { reports });
  
  await fs.writeFile(path.join(reportsDir, 'index.html'), html, 'utf-8');
  console.log(`Report index generated at: ${path.join(reportsDir, 'index.html')}`);
}

async function generateReport(summaryPath: string, outputPath: string): Promise<void> {
  // Ensure reports directory exists
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const summaryData = await fs.readFile(summaryPath, 'utf-8');
  const summary = JSON.parse(summaryData);
  
  // Load template
  const templatePath = path.join(process.cwd(), 'eval', 'templates', 'report.html');
  
  let template;
  try {
    template = await fs.readFile(templatePath, 'utf-8');
    console.log(`Loaded report template from ${templatePath}`);
  } catch (error) {
    console.error(`Error loading template from ${templatePath}:`, error);
    // Fall back to a basic template if the file doesn't exist
    // Using minimal version - in a real implementation you'd have a complete fallback template
    template = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Honeycomb MCP Evaluation Report</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #F5A623; border-bottom: 2px solid #F5A623; padding-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Honeycomb MCP Evaluation Report</h1>
    <p>Generated on: {{timestamp}}</p>
    <p>See template file for complete implementation.</p>
  </div>
</body>
</html>`;
  }
  
  // Prepare template data
  const view = {
    timestamp: new Date(summary.timestamp).toLocaleString(),
    totalTests: summary.totalTests,
    passed: summary.passed,
    failed: summary.failed,
    successRate: (summary.successRate * 100).toFixed(1),
    averageLatency: summary.averageLatency.toFixed(0),
    averageToolCalls: summary.averageToolCalls ? summary.averageToolCalls.toFixed(1) : 'N/A',
    averageToolTokens: summary.averageToolTokens ? summary.averageToolTokens.toFixed(0) : 'N/A',
    judgeInfo: summary.metadata?.judge ? {
      provider: summary.metadata.judge.provider,
      model: summary.metadata.judge.model
    } : null,
    results: summary.results.map(result => {
      const isAgent = result.prompt.agentMode;
      const isConversation = result.prompt.conversationMode;
      const isMultiStep = result.prompt.steps && result.prompt.steps.length > 0;
      const isSingle = !isAgent && !isConversation && !isMultiStep;
      
      // Format token usage if available
      const hasTokenUsage = result.metrics.tokenUsage?.total !== undefined;
      
      // Format tool calls
      const hasToolCalls = result.toolCalls && result.toolCalls.length > 0;
      const toolCalls = hasToolCalls ? result.toolCalls.map((call, idx) => ({
        tool: call.tool || 'N/A',
        index: idx + 1,
        parametersJson: JSON.stringify(call.parameters || {}, null, 2),
        responseJson: JSON.stringify(call.response || {}, null, 2),
        callLatency: call.latencyMs || 0
      })) : [];
      
      // Get agent scores if available
      const agentScores = result.validation.agentScores;
      
      return {
        id: result.id,
        provider: result.provider,
        model: result.model,
        modelSafe: result.model.replace(/[^a-zA-Z0-9-]/g, '_'),
        isAgent,
        isConversation,
        isMultiStep,
        isSingle,
        toolCallCount: result.metrics.toolCallCount || 1,
        passed: result.validation.passed,
        score: result.validation.score !== undefined ? result.validation.score.toFixed(2) : 'N/A',
        reasoning: result.validation.reasoning,
        latency: result.metrics.latencyMs,
        // Agent-specific metrics
        goalAchievement: agentScores?.goalAchievement !== undefined ? agentScores.goalAchievement.toFixed(2) : 'N/A',
        reasoningQuality: agentScores?.reasoningQuality !== undefined ? agentScores.reasoningQuality.toFixed(2) : 'N/A',
        pathEfficiency: agentScores?.pathEfficiency !== undefined ? agentScores.pathEfficiency.toFixed(2) : 'N/A',
        hasTokenUsage,
        promptTokens: result.metrics.tokenUsage?.prompt || 0,
        completionTokens: result.metrics.tokenUsage?.completion || 0,
        totalTokens: result.metrics.tokenUsage?.total || 0,
        toolPromptTokens: result.metrics.tokenUsage?.toolPrompt || 0,
        toolCompletionTokens: result.metrics.tokenUsage?.toolCompletion || 0,
        toolTotalTokens: result.metrics.tokenUsage?.toolTotal || 0,
        hasToolCalls,
        toolCallsLength: toolCalls.length,
        toolCalls,
        toolResponseJson: JSON.stringify(result.toolResponse, null, 2),
        promptJson: JSON.stringify(result.prompt, null, 2)
      };
    })
  };
  
  // Render template
  const html = mustache.render(template, view);
  
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
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    
    // Initialize providers array
    const providers: LLMProvider[] = [];
    
    // Add providers based on available API keys
    if (openaiApiKey) {
      providers.push(new OpenAIProvider(openaiApiKey));
      console.log('Added OpenAI provider with API key');
    }
    
    if (anthropicApiKey) {
      providers.push(new AnthropicProvider(anthropicApiKey));
      console.log('Added Anthropic provider with API key');
    }
    
    // Exit if no API keys are available
    if (providers.length === 0) {
      console.error('\nERROR: No valid API keys available.\n');
      console.error('You must set at least one of these environment variables:');
      console.error('  - OPENAI_API_KEY    for OpenAI models');
      console.error('  - ANTHROPIC_API_KEY for Anthropic models\n');
      console.error('For example: OPENAI_API_KEY=your_key pnpm run eval\n');
      process.exit(1);
    }
    
    // Judge configuration
    const config: EvalConfig = {
      judgeProvider: process.env.EVAL_JUDGE_PROVIDER || 'anthropic',
      judgeModel: process.env.EVAL_JUDGE_MODEL || 'claude-3-5-haiku-latest'
    };
    
    // Validate judge configuration
    const judgeProvider = providers.find(p => p.name === config.judgeProvider);
    if (!judgeProvider) {
      console.error(`Specified judge provider "${config.judgeProvider}" not available. Check API keys and configuration.`);
      process.exit(1);
    }
    
    // Check if the model exists for the provider
    if (!judgeProvider.models.includes(config.judgeModel)) {
      console.warn(`Warning: Judge model "${config.judgeModel}" not in known models for ${config.judgeProvider}.`);
      console.warn(`Available models: ${judgeProvider.models.join(', ')}`);
      console.warn('Continuing with the specified model, but it might not work.');
    }
    
    console.log(`Using ${config.judgeProvider}/${config.judgeModel} as the validation judge`);
    
    // Select models to use (could be from config or args)
    // Parse from JSON string in env var if available
    // This can be either a string or an array of strings for each provider
    let selectedModels = new Map([
      ['openai', ['gpt-4o']],
      ['anthropic', ['claude-3-5-haiku-latest']]
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
      concurrency,
      judge: {
        provider: config.judgeProvider,
        model: config.judgeModel
      }
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