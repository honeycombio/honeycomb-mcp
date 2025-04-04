# Honeycomb MCP Evaluation Framework

This evaluation framework provides a structured way to test and validate the Honeycomb MCP tools. It uses an LLM-based evaluation approach to assess the quality and correctness of tool responses.

## How It Works

1. **Launching the MCP Server**: The framework can either start the MCP server as a child process or connect to an already running server via HTTP.

2. **Test Execution**: For each test prompt, the framework:
   - Calls the specified MCP tool with the test parameters
   - Records the response
   - Submits the response to an LLM for evaluation based on criteria
   - Records metrics and validation results

3. **Reporting**: After all tests complete, a summary and detailed HTML report are generated.

## Directory Structure

- `/prompts` - JSON files containing test and validation prompts
- `/scripts` - TypeScript implementation of the evaluation runner
- `/results` - Evaluation results stored as JSON files
- `/reports` - Generated HTML reports

## Prompt Schema

Each evaluation prompt is defined as a JSON file with the following structure:

```json
{
  "id": "unique-test-id",
  "name": "Human-readable test name",
  "description": "Test description",
  "tool": "tool_name",
  "prompt": "The prompt to use for the tool",
  "parameters": {
    "param1": "value1",
    "param2": "value2"
  },
  "validation": {
    "prompt": "Instructions for validating the response",
    "expectedOutcome": {
      "success": true,
      "criteria": [
        "Criterion 1",
        "Criterion 2"
      ]
    }
  },
  "options": {
    "timeout": 5000
  }
}
```

## Running Evaluations

1. Install dependencies:
   ```
   pnpm install
   ```

2. Set up environment variables:
   - Create a `.env` file in the project root using `.env.example` as a template
   ```
   cp .env.example .env
   ```
   - Edit the `.env` file to add your API keys and modify configuration

3. Build the project first:
   ```
   pnpm run build
   ```

4. Run the evaluation:
   ```
   pnpm run eval
   ```

5. Generate a report from an existing summary:
   ```
   pnpm run eval:report eval/results/summary-file.json
   ```

## Configuration Options

The framework can be configured using the following environment variables:

### LLM Provider Configuration
- `OPENAI_API_KEY` - Your OpenAI API key
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `EVAL_MODELS` - JSON mapping of provider names to models, e.g. `{"openai":"gpt-4o","anthropic":"claude-3-sonnet"}`
- `EVAL_CONCURRENCY` - Number of concurrent evaluations to run (default: 2)

### MCP Server Configuration
- `MCP_SERVER_COMMAND` - Command to start the MCP server as a child process (e.g. `node build/index.mjs`)
- `MCP_SERVER_URL` - URL for connecting to a running MCP server via HTTP (overrides command if both are set)

## Extending the Framework

### Adding New Providers

Create a new class that implements the `LLMProvider` interface in `run-eval.ts`:

```typescript
class MyProvider implements LLMProvider {
  name = 'provider-name';
  models = ['model-1', 'model-2'];
  private tokenCounts = { prompt: 0, completion: 0, total: 0 };

  constructor(private apiKey: string) {}

  async runPrompt(prompt: string, model: string): Promise<string> {
    // Implementation
  }

  getTokenUsage() {
    return { ...this.tokenCounts };
  }
}
```

### Adding New Test Prompts

Create new JSON files in the `prompts` directory following the schema above. Each prompt should:

1. Target a specific MCP tool
2. Provide test parameters
3. Include clear validation criteria
4. Have a unique ID and descriptive name

## GitHub Actions Integration

The repository includes a GitHub Actions workflow that:

1. Builds the MCP server
2. Runs all evaluations against the built server
3. Generates an HTML report
4. Uploads results as workflow artifacts
5. Posts a summary comment to the PR (if running on a PR)

To run evaluations in CI:
```
pnpm tsx eval/scripts/run-eval.ts run
```

## Troubleshooting

### Common Issues

- **Missing API Keys**: Ensure you've set the `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` environment variables.
- **MCP Server Not Starting**: Check the server command in `MCP_SERVER_COMMAND` and verify paths are correct.
- **Tool Not Found**: Ensure the tool name in the prompt file matches a tool exposed by the MCP server.
- **High Failure Rate**: Review validation criteria to ensure they're reasonable and match expected outputs.