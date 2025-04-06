# Honeycomb MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server for interacting with Honeycomb observability data. This server enables LLMs like Claude to directly analyze and query your Honeycomb datasets across multiple environments.

## Honeycomb Enterprise Only

Currently, this is only available for Honeycomb Enterprise customers.

## How it works

Today, this is a single server process **that you must run on your own computer**. It is not authenticated. All information uses STDIO between your client and the server.

## Installation

```bash
pnpm install
pnpm run build
```

The build artifact goes into the `/build` folder.

## Configuration

To use this MCP server, you need to provide Honeycomb API keys via environment variables in your MCP config.

```json
{
    "mcpServers": {
      "honeycomb": {
        "command": "node",
        "args": [
          "/fully/qualified/path/to/honeycomb-mcp/build/index.mjs"
        ],
        "env": {
          "HONEYCOMB_API_KEY": "your_api_key"
        }
      }
    }
}
```

For multiple environments:

```json
{
    "mcpServers": {
      "honeycomb": {
        "command": "node",
        "args": [
          "/fully/qualified/path/to/honeycomb-mcp/build/index.mjs"
        ],
        "env": {
          "HONEYCOMB_ENV_PROD_API_KEY": "your_prod_api_key",
          "HONEYCOMB_ENV_STAGING_API_KEY": "your_staging_api_key"
        }
      }
    }
}
```

**Important:** These environment variables **must** bet set in the `env` block of your MCP config.

### EU Configuration

EU customers must also set a `HONEYCOMB_API_ENDPOINT` configuration, since the MCP defaults to the non-EU instance.

```bash
# Optional custom API endpoint (defaults to https://api.honeycomb.io)
HONEYCOMB_API_ENDPOINT=https://api.eu1.honeycomb.io/
```

### Caching Configuration

The MCP server implements caching for all non-query Honeycomb API calls to improve performance and reduce API usage. Caching can be configured using these environment variables:

```bash
# Enable/disable caching (default: true)
HONEYCOMB_CACHE_ENABLED=true

# Default TTL in seconds (default: 300)
HONEYCOMB_CACHE_DEFAULT_TTL=300

# Resource-specific TTL values in seconds (defaults shown)
HONEYCOMB_CACHE_DATASET_TTL=900    # 15 minutes
HONEYCOMB_CACHE_COLUMN_TTL=900     # 15 minutes
HONEYCOMB_CACHE_BOARD_TTL=900      # 15 minutes
HONEYCOMB_CACHE_SLO_TTL=900        # 15 minutes
HONEYCOMB_CACHE_TRIGGER_TTL=900    # 15 minutes
HONEYCOMB_CACHE_MARKER_TTL=900     # 15 minutes
HONEYCOMB_CACHE_RECIPIENT_TTL=900  # 15 minutes
HONEYCOMB_CACHE_AUTH_TTL=3600      # 1 hour

# Maximum cache size (items per resource type)
HONEYCOMB_CACHE_MAX_SIZE=1000
```

## Client compatibility

Honeycomb MCP has been tested with the following clients:

- [Claude Desktop](https://modelcontextprotocol.io/quickstart/user)
- [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/tutorials#set-up-model-context-protocol-mcp)
- [Cursor](https://docs.cursor.com/context/model-context-protocol)
- [Windsurf](https://docs.codeium.com/windsurf/mcp)
- [Goose](https://block.github.io/goose/docs/getting-started/using-extensions#mcp-servers)

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
- Optimized performance with TTL-based caching for all non-query API calls

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

- `analyze_columns`: Analyzes specific columns in a dataset by running statistical queries and returning computed metrics.

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

- `get_trace_link`: Generate a deep link to a specific trace in the Honeycomb UI
  
- `get_instrumentation_help`: Provides OpenTelemetry instrumentation guidance
  ```json
  {
    "language": "python",
    "filepath": "app/services/payment_processor.py"
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
