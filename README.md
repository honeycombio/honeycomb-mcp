# Honeycomb MCP Server

[![smithery badge](https://smithery.ai/badge/hny-mcp)](https://smithery.ai/server/hny-mcp)

A [Model Context Protocol](https://modelcontextprotocol.io) server for interacting with Honeycomb observability data. This server enables LLMs like Claude to directly analyze and query your Honeycomb datasets across multiple environments.

## Features

- Query Honeycomb datasets across multiple environments
- Analyze columns and data patterns
- Run basic analytics queries
- Monitor SLOs and their status
- View and analyze Triggers
- Access dataset metadata and schema information

## Installation

### Installing via Smithery

To install Honeycomb MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/hny-mcp):

```bash
npx -y @smithery/cli install hny-mcp --client claude
```

### Manual Installation
```bash
npm install
npm run build
```

## Configuration

Create a configuration file at `~/.hny/config.json` with your Honeycomb environments and API keys:

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

Each environment entry can also optionally include a `baseUrl` if you're using a different API endpoint.

## Usage

### With Claude Desktop

Add this to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "honeycomb": {
      "command": "node",
      "args": ["/path/to/build/index.mjs"]
    }
  }
}
```

### Available Tools

- `list-datasets`: List all datasets in an environment
- `get-columns`: List all columns in a dataset
- `run-query`: Run basic analytics queries with aggregations
- `analyze-column`: Get detailed analysis of specific columns
- `list-slos`: View all SLOs for a dataset
- `get-slo`: Get detailed SLO status including compliance
- `list-triggers`: View all triggers for a dataset
- `get-trigger`: Get detailed trigger information

### Resources

The server exposes Honeycomb datasets as resources with the URI format:
`honeycomb://{environment}/{dataset-slug}`

For example:
- `honeycomb://production/api-requests`
- `honeycomb://staging/backend-services`

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

## Example Queries

Ask Claude things like:

- "What datasets are available in the production environment?"
- "Show me the SLO compliance for the API availability in production"
- "Are there any active triggers in the staging environment?"
- "What's the error rate in the production API dataset over the last hour?"

## License

MIT
