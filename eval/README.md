# Honeycomb MCP Evaluation Framework

This evaluation framework provides a structured way to test and validate the Honeycomb MCP tools. It uses an LLM-based evaluation approach to assess the quality and correctness of tool responses, with support for both single-step and multi-step evaluations.

## How It Works

1. **Launching the MCP Server**: The framework can either start the MCP server as a child process or connect to an already running server via HTTP.

2. **Test Execution**: The framework supports multiple evaluation modes:

   - **Single Tool Mode**: Calls a single specified tool and evaluates the response
   - **Multi-Step Mode**: Executes a pre-defined sequence of tool calls and evaluates the combined results
   - **Conversation Mode**: Uses an LLM to dynamically determine which tools to call in sequence, tracking a full conversation flow

3. **Validation**: Test responses are validated using a configurable "judge" model, which can be separate from the model used for tool interactions. This allows for consistent validation across different provider tests.

4. **Metrics Collection**: For each test, the framework captures:
   - Execution time and latency
   - Tool call counts
   - Tool-specific token usage (separated from validation tokens)
   - Validation results

5. **Reporting**: After all tests complete, a summary and detailed HTML report are generated with comprehensive metrics.

## Directory Structure

- `/prompts` - JSON files containing test and validation prompts
- `/scripts` - TypeScript implementation of the evaluation runner
- `/results` - Evaluation results stored as JSON files
- `/reports` - Generated HTML reports
- `/templates` - HTML templates for report generation

## Prompt Schema

### Single Tool Mode

The original mode for evaluating a single tool call:

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

### Multi-Step Mode

For evaluating a pre-defined sequence of tool calls with support for parameter expansion:

```json
{
  "id": "multi-step-test",
  "name": "Multi-Step Dataset Query Test",
  "description": "Tests retrieving dataset info then running a query",
  "prompt": "Get columns then run a query",
  "steps": [
    {
      "tool": "get_columns",
      "parameters": {
        "environment": "production",
        "dataset": "api"
      },
      "description": "Get column data"
    },
    {
      "tool": "run_query",
      "parameters": {
        "environment": "production",
        "dataset": "api",
        "calculations": [
          {"op": "AVG", "column": "${{step:0.columns[2].key}}"}
        ],
        "time_range": 60
      },
      "description": "Run query using columns from previous step"
    }
  ],
  "validation": {
    "prompt": "Validate that both calls succeeded and returned valid data"
  },
  "options": {
    "timeout": 10000
  }
}
```

#### Parameter Expansion Syntax

Multi-step mode supports using results from previous steps through parameter expansion with this syntax:

```
${{step:INDEX.PATH.TO.VALUE}}
${{step:INDEX.PATH.TO.VALUE||FALLBACK}}
```

Where:
- `INDEX` is the zero-based index of the previous step
- `PATH.TO.VALUE` is a dot-notation path to access nested properties
- Array notation is also supported: `columns[0].name`
- `FALLBACK` (optional) is a fallback value to use if the path doesn't exist

Examples:
- `${{step:0.columns[2].key}}` - Reference the key from the 3rd column returned in step 0
- `${{step:1.results.summary.totalCount}}` - Reference totalCount from step 1's results
- `${{step:0.environments[0]}}` - Reference the first environment from step 0
- `${{step:0.columns[0].key||duration_ms}}` - Use the first column's key, or fall back to "duration_ms" if not found

The parameter expansion system includes intelligent fallbacks for common Honeycomb data types. If a referenced path isn't found and no fallback is provided, it will:
1. Try to find an appropriate column based on context (e.g., duration related columns for metrics)
2. Fall back to common field names if needed (duration_ms, name, etc.)
3. Use the first available column if nothing else works
```

### Conversation Mode

For LLM-driven multi-step evaluations:

```json
{
  "id": "conversation-test",
  "name": "Dataset Exploration Conversation",
  "description": "Tests exploring datasets with multiple steps",
  "prompt": "Explore datasets and find latency-related columns",
  "conversationMode": true,
  "maxSteps": 4,
  "validation": {
    "prompt": "Validate the exploration was logical and found relevant columns"
  },
  "options": {
    "timeout": 30000
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
   
   Specific provider options:
   ```
   pnpm run eval:openai    # Use OpenAI models
   pnpm run eval:anthropic # Use Anthropic models
   pnpm run eval:gemini    # Use Google Gemini models
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
- `GEMINI_API_KEY` - Your Google Gemini API key
- `EVAL_MODELS` - JSON mapping of provider names to models, e.g. `{"openai":"gpt-4o","anthropic":"claude-3-sonnet","gemini":"gemini-2.0-flash-001"}`
- `EVAL_CONCURRENCY` - Number of concurrent evaluations to run (default: 2)
- `EVAL_JUDGE_PROVIDER` - Provider to use for validation (default: "anthropic")
- `EVAL_JUDGE_MODEL` - Model to use for validation (default: "claude-3-5-haiku-latest")

### MCP Server Configuration
- `MCP_SERVER_COMMAND` - Command to start the MCP server as a child process (e.g. `node build/index.mjs`)
- `MCP_SERVER_URL` - URL for connecting to a running MCP server via HTTP (overrides command if both are set)

## Testing Strategies

### Single Tool Tests
Best for validating individual tool functionality and ensuring each tool works correctly in isolation. Use this for basic functionality testing of each tool.

### Multi-Step Tests
Useful for validating common workflows that involve multiple tools in sequence. Examples include:
- Getting dataset info then running a query
- Analyzing columns before creating a visualization
- Testing related operations that build on each other

### Conversation Mode Tests
Ideal for testing more complex and exploratory scenarios where the path isn't predetermined. This helps evaluate:
- Tool discovery and exploration capabilities
- Ability to handle errors and adjust strategy
- Efficiency in completing tasks (number of steps taken)

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

1. Target either a specific tool or define multiple steps
2. Provide clear parameters for each step
3. Include validation criteria appropriate to the test type
4. Have a unique ID and descriptive name

## GitHub Actions Integration

The repository includes a GitHub Actions workflow that:

1. Builds the MCP server
2. Runs all evaluations against the built server
3. Generates an HTML report with metrics
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
- **Tool Not Found**: Ensure the tool names in prompts match tools exposed by the MCP server.
- **High Failure Rate**: Review validation criteria to ensure they're reasonable and match expected outputs.
- **Conversation Mode Issues**: If conversation mode tests fail, check the prompt clarity and ensure the `maxSteps` value is appropriate.