# Honeycomb MCP Server
[![smithery badge](https://smithery.ai/badge/@honeycombio/honeycomb-mcp)](https://smithery.ai/server/@honeycombio/honeycomb-mcp)

A [Model Context Protocol](https://modelcontextprotocol.io) server for interacting with Honeycomb observability data. This server enables LLMs like Claude to directly analyze and query your Honeycomb datasets across multiple environments.

## Honeycomb Enterprise Only

Currently, this is only available for Honeycomb Enterprise customers.

## Installation

### Installing via Smithery

To install Honeycomb MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@honeycombio/honeycomb-mcp):

```bash
npx -y @smithery/cli install @honeycombio/honeycomb-mcp --client claude
```

### Manual Installation
```bash
pnpm install
pnpm run build
```

The build artifact goes into the `/build` folder.

## Honeycomb Configuration

Create a configuration file at `.mcp-honeycomb.json` in one of these locations:

- Current directory (recommended)
- Home directory (`~/` on macos, for example)
- Custom location specified by `MCP_HONEYCOMB_CONFIG` environment variable

Example configuration:

```json
{
  "environments": [
    {
      "name": "production",
      "apiKey": "your_prod_api_key"
    },
    {
      "name": "staging",
      "apiKey": "your_staging_api_key"
    }
  ]
}
```

**This configuration is required to use the Honeycomb MCP Server.**

## MCP Configuration

You'll need to run `node` on the location of the build artifact and specify the location of your Honeycomb MCP config.

```json
{
    "mcpServers": {
      "honeycomb": {
        "command": "node",
        "args": [
          "/fully/qualified/path/to/honeycomb-mcp/build/index.mjs"
        ],
        "env": {
          "MCP_HONEYCOMB_CONFIG": "/fully/qualified/path/to/.mcp-honeycomb.json"
        }
      }
    }
}
```

You can omit the `env` section if you have a more central installation, but it's recommended to have a config file per codebase.

The above configuration has been tested with the following clients:

- [Claude Desktop](https://modelcontextprotocol.io/quickstart/user)
- [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/tutorials#set-up-model-context-protocol-mcp)
- [Cursor](https://docs.cursor.com/context/model-context-protocol)
- [Windsurf](https://docs.codeium.com/windsurf/mcp)

It will likely work with other clients.

## Features

- Query Honeycomb datasets across multiple environments
- Run analytics queries with support for:
  - Multiple calculation types (COUNT, AVG, P95, etc.)
  - Breakdowns and filters
  - Time-based analysis
- Monitor SLOs and their status (Enterprise only)
- Analyze columns and data patterns
- View and analyze Triggers
- Access dataset metadata and schema information

#### Resources

Access Honeycomb datasets using URIs in the format:
`honeycomb://{environment}/{dataset}`

For example:
- `honeycomb://production/api-requests`
- `honeycomb://staging/backend-services`

The resource response includes:
- Dataset name
- Column information (name, type, description)
- Schema details

#### Tools

- `list_datasets`: List all datasets in an environment
  ```json
  { "environment": "production" }
  ```

- `get_columns`: Get column information for a dataset
  ```json
  {
    "environment": "production",
    "dataset": "api-requests"
  }
  ```

- `run_query`: Run analytics queries with rich options
  ```json
  {
    "environment": "production",
    "dataset": "api-requests",
    "calculations": [
      { "op": "COUNT" },
      { "op": "P95", "column": "duration_ms" }
    ],
    "breakdowns": ["service.name"],
    "time_range": 3600
  }
  ```

- `analyze_column`: Get statistical analysis of a column
  ```json
  {
    "environment": "production",
    "dataset": "api-requests",
    "column": "duration_ms"
  }
  ```

- `list_slos`: List all SLOs for a dataset
  ```json
  {
    "environment": "production",
    "dataset": "api-requests"
  }
  ```

- `get_slo`: Get detailed SLO information
  ```json
  {
    "environment": "production",
    "dataset": "api-requests",
    "sloId": "abc123"
  }
  ```

- `list_triggers`: List all triggers for a dataset
  ```json
  {
    "environment": "production",
    "dataset": "api-requests"
  }
  ```

- `get_trigger`: Get detailed trigger information
  ```json
  {
    "environment": "production",
    "dataset": "api-requests",
    "triggerId": "xyz789"
  }
  ```

### Example Queries with Claude

Ask Claude things like:

- "What datasets are available in the production environment?"
- "Show me the P95 latency for the API service over the last hour"
- "What's the error rate broken down by service name?"
- "Are there any SLOs close to breaching their budget?"
- "Show me all active triggers in the staging environment"
- "What columns are available in the production API dataset?"

### Optimized Tool Responses

All tool responses are optimized to reduce context window usage while maintaining essential information:

- **List datasets**: Returns only name, slug, and description
- **Get columns**: Returns streamlined column information focusing on name, type, and description
- **Run query**: 
  - Includes actual results and necessary metadata
  - Adds automatically calculated summary statistics
  - Only includes series data for heatmap queries
  - Omits verbose metadata, links and execution details
- **Analyze column**: 
  - Returns top values, counts, and key statistics
  - Automatically calculates numeric metrics when appropriate
- **SLO information**: Streamlined to key status indicators and performance metrics
- **Trigger information**: Focused on trigger status, conditions, and notification targets

This optimization ensures that responses are concise but complete, allowing LLMs to process more data within context limitations.

### Query Specification for `run_query`

The `run_query` tool supports a comprehensive query specification:

- **calculations**: Array of operations to perform
  - Supported operations: COUNT, CONCURRENCY, COUNT_DISTINCT, HEATMAP, SUM, AVG, MAX, MIN, P001, P01, P05, P10, P25, P50, P75, P90, P95, P99, P999, RATE_AVG, RATE_SUM, RATE_MAX
  - Some operations like COUNT and CONCURRENCY don't require a column
  - Example: `{"op": "HEATMAP", "column": "duration_ms"}`

- **filters**: Array of filter conditions
  - Supported operators: =, !=, >, >=, <, <=, starts-with, does-not-start-with, exists, does-not-exist, contains, does-not-contain, in, not-in
  - Example: `{"column": "error", "op": "=", "value": true}`

- **filter_combination**: "AND" or "OR" (default is "AND")

- **breakdowns**: Array of columns to group results by
  - Example: `["service.name", "http.status_code"]`

- **orders**: Array specifying how to sort results
  - Must reference columns from breakdowns or calculations
  - HEATMAP operation cannot be used in orders
  - Example: `{"op": "COUNT", "order": "descending"}`

- **time_range**: Relative time range in seconds (e.g., 3600 for last hour)
  - Can be combined with either start_time or end_time but not both

- **start_time** and **end_time**: UNIX timestamps for absolute time ranges

- **having**: Filter results based on calculation values
  - Example: `{"calculate_op": "COUNT", "op": ">", "value": 100}`

### Example Queries

Here are some real-world example queries:

#### Find Slow API Calls
```json
{
  "environment": "production",
  "dataset": "api-requests",
  "calculations": [
    {"column": "duration_ms", "op": "HEATMAP"},
    {"column": "duration_ms", "op": "MAX"}
  ],
  "filters": [
    {"column": "trace.parent_id", "op": "does-not-exist"}
  ],
  "breakdowns": ["http.target", "name"],
  "orders": [
    {"column": "duration_ms", "op": "MAX", "order": "descending"}
  ]
}
```

#### Distribution of DB Calls (Last Week)
```json
{
  "environment": "production",
  "dataset": "api-requests",
  "calculations": [
    {"column": "duration_ms", "op": "HEATMAP"}
  ],
  "filters": [
    {"column": "db.statement", "op": "exists"}
  ],
  "breakdowns": ["db.statement"],
  "time_range": 604800
}
```

#### Exception Count by Exception and Caller
```json
{
  "environment": "production",
  "dataset": "api-requests",
  "calculations": [
    {"op": "COUNT"}
  ],
  "filters": [
    {"column": "exception.message", "op": "exists"},
    {"column": "parent_name", "op": "exists"}
  ],
  "breakdowns": ["exception.message", "parent_name"],
  "orders": [
    {"op": "COUNT", "order": "descending"}
  ]
}
```

## Development

```bash
pnpm install
pnpm run build
```

## Requirements

- Node.js 16+
- Honeycomb API keys with appropriate permissions:
  - Query access for analytics
  - Read access for SLOs and Triggers
  - Environment-level access for dataset operations

## License

MIT
