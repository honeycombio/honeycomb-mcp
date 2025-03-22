import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { HoneycombAPI } from "./api/client.js";
import { z } from "zod";
import {
  DatasetArgumentsSchema,
  QueryToolSchema,
  ColumnAnalysisSchema,
} from "./types/schema.js";
import { Dataset } from "./types/api.js";
import { HoneycombError } from "./utils/errors.js";
import process from "node:process";
import { AnalysisQuery } from "./types/query.js";

/**
 * Calculate summary statistics for query results to provide useful insights
 * without overwhelming the context window
 */
function summarizeResults(results: any[], params: z.infer<typeof QueryToolSchema>) {
  if (!results || results.length === 0) {
    return { count: 0 };
  }
  
  const summary = {
    count: results.length,
  };
  
  // If we have calculation columns, add some statistics about them
  if (params.calculations) {
    // Get numeric calculation columns (excluding HEATMAP, COUNT, CONCURRENCY)
    const numericColumns = params.calculations
      .filter(calc => 
        calc.op !== "COUNT" && 
        calc.op !== "CONCURRENCY" && 
        calc.op !== "HEATMAP" &&
        calc.column
      )
      .map(calc => `${calc.op}(${calc.column})`);
    
    // Add summary stats for each numeric column
    numericColumns.forEach(colName => {
      if (results[0] && colName in results[0]) {
        // Calculate min/max/avg if the column exists in results
        const values = results.map(r => r[colName]).filter(v => v !== null && v !== undefined);
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const sum = values.reduce((a, b) => a + b, 0);
          const avg = sum / values.length;
          
          // Calculate median (P50 approximation)
          const sortedValues = [...values].sort((a, b) => a - b);
          const medianIndex = Math.floor(sortedValues.length / 2);
          const median = sortedValues.length % 2 === 0
            ? (sortedValues[medianIndex - 1] + sortedValues[medianIndex]) / 2
            : sortedValues[medianIndex];
          
          // @ts-ignore - dynamically adding properties
          summary[colName] = { 
            min, 
            max, 
            avg,
            median,
            sum,
            // Add range and standard deviation for better distribution insight
            range: max - min,
            stdDev: calculateStdDev(values, avg)
          };
        }
      }
    });
    
    // Special handling for COUNT operations
    const hasCount = params.calculations.some(calc => calc.op === "COUNT");
    if (hasCount && results.length > 0 && 'COUNT' in results[0]) {
      const countValues = results.map(r => r.COUNT).filter(v => v !== null && v !== undefined);
      if (countValues.length > 0) {
        const totalCount = countValues.reduce((a, b) => a + b, 0);
        const maxCount = Math.max(...countValues);
        const minCount = Math.min(...countValues);
        
        // @ts-ignore - dynamically adding properties
        summary.countStats = {
          total: totalCount,
          max: maxCount, 
          min: minCount,
          avg: totalCount / countValues.length
        };
      }
    }
  }
  
  // Add unique count for breakdown columns
  if (params.breakdowns && params.breakdowns.length > 0) {
    const breakdownStats = {};
    
    params.breakdowns.forEach(col => {
      const uniqueValues = new Set(results.map(r => r[col]));
      // @ts-ignore - dynamically adding properties
      breakdownStats[col] = {
        uniqueCount: uniqueValues.size,
        // Add top values (up to 5) with their frequencies
        topValues: getTopValues(results, col, 5)
      };
    });
    
    // @ts-ignore - dynamically adding properties
    summary.breakdowns = breakdownStats;
  }
  
  return summary;
}

/**
 * Calculate standard deviation for an array of values
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  
  const squareDiffs = values.map(value => {
    const diff = value - mean;
    return diff * diff;
  });
  
  const avgSquareDiff = squareDiffs.reduce((sum, value) => sum + value, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Get top N values with their frequencies
 */
function getTopValues(results: any[], column: string, limit: number = 5): Array<{value: any, count: number}> {
  const valueCounts = new Map();
  
  // Count frequencies
  results.forEach(result => {
    const value = result[column];
    if (value !== undefined && value !== null) {
      valueCounts.set(value, (valueCounts.get(value) || 0) + 1);
    }
  });
  
  // Convert to array and sort by frequency
  return Array.from(valueCounts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

async function handleToolError(
  error: unknown,
  toolName: string,
): Promise<{ content: { type: "text"; text: string }[] }> {
  let errorMessage = "Unknown error occurred";

  if (error instanceof HoneycombError) {
    errorMessage = `Honeycomb API error (${error.statusCode}): ${error.message}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  // Log the error to stderr for debugging
  console.error(`Tool '${toolName}' failed:`, error);

  return {
    content: [
      {
        type: "text",
        text: `Failed to execute tool '${toolName}': ${errorMessage}\n\n` +
          `Please verify:\n` +
          `- The environment name is correct and configured in .mcp-honeycomb.json\n` +
          `- Your API key is valid\n` +
          `- The dataset exists (if specified)\n` +
          `- Required parameters are provided correctly`,
      },
    ],
  };
}

// Create a main async function to run everything
async function main() {
  // Load config and create API client
  const config = loadConfig();
  const api = new HoneycombAPI(config);

  // Create server with proper initialization options
  const server = new McpServer({
    name: "honeycomb",
    version: "1.0.0"
  });

  // Register resource for datasets
  server.resource(
    "datasets",
    new ResourceTemplate("honeycomb://{environment}/{dataset}", { 
      list: async () => {
        const environments = api.getEnvironments();
        const resources: { uri: string; name: string; description?: string }[] = [];
        
        for (const env of environments) {
          try {
            const datasets = await api.listDatasets(env);
            datasets.forEach((dataset: Dataset) => {
              resources.push({
                uri: `honeycomb://${env}/${dataset.slug}`,
                name: dataset.name,
                description: dataset.description || `Dataset ${dataset.name} in environment ${env}`,
              });
            });
          } catch (error) {
            console.error(`Error listing datasets for environment ${env}:`, error);
          }
        }

        return { resources };
      }
    }),
    async (uri, { environment, dataset }) => {
      try {
        if (dataset) {
          // Get specific dataset
          const datasetInfo = await api.getDataset(environment as string, dataset as string);
          const columns = await api.getVisibleColumns(environment as string, dataset as string);

          // Create a streamlined version of dataset info
          const datasetWithColumns = {
            name: datasetInfo.name,
            description: datasetInfo.description || '',
            slug: datasetInfo.slug,
            columns: columns
              .filter(c => !c.hidden) // Only show visible columns
              .map((c) => ({
                name: c.key_name,
                type: c.type,
                description: c.description || '',
              }))
              .sort((a, b) => a.name.localeCompare(b.name)), // Sort by column name
          };

          return {
            contents: [
              {
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(datasetWithColumns, null, 2),
              },
            ],
          };
        } else {
          // List all datasets with simplified info
          const datasets = await api.listDatasets(environment as string);
          return {
            contents: datasets.map((dataset: Dataset) => ({
              uri: `honeycomb://${environment}/${dataset.slug}`,
              text: JSON.stringify({
                name: dataset.name,
                slug: dataset.slug,
                description: dataset.description || '',
              }, null, 2),
            })),
          };
        }
      } catch (error) {
        throw new Error(`Failed to read dataset: ${error}`);
      }
    }
  );

  // Register tools
  server.tool(
    "list_datasets",
    { environment: z.string() },
    async ({ environment }) => {
      try {
        const datasets = await api.listDatasets(environment);
        // Simplify the response to reduce context window usage
        const simplifiedDatasets = datasets.map(dataset => ({
          name: dataset.name,
          slug: dataset.slug,
          description: dataset.description || '',
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedDatasets, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "list_datasets");
      }
    }
  );

  server.tool(
    "get_columns",
    {
      environment: z.string(),
      dataset: z.string(),
    },
    async ({ environment, dataset }) => {
      try {
        const columns = await api.getVisibleColumns(environment, dataset);
        // Simplify the response to reduce context window usage
        const simplifiedColumns = columns.map(column => ({
          name: column.key_name,
          type: column.type,
          description: column.description || '',
          hidden: column.hidden || false,
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedColumns, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_columns");
      }
    }
  );

  server.tool(
    "run_query",
    QueryToolSchema.shape,
    async (params) => {
      try {
        // Validate calculation and operation combinations
        const hasHeatmap = params.calculations.some(calc => calc.op === "HEATMAP");
        
        // Get all calculation identifiers for validation
        const calculationIds = params.calculations.map(calc => {
          if (calc.op === "COUNT" || calc.op === "CONCURRENCY") {
            return calc.op;
          }
          return `${calc.op}(${calc.column})`;
        });
        
        // Validate orders if they reference calculations or breakdowns
        if (params.orders) {
          const calculationOps = params.calculations.map(calc => calc.op);
          const validOrderOps = [...calculationOps];
          
          // Add COUNT and CONCURRENCY if not already in calculationOps
          if (!validOrderOps.includes("COUNT")) validOrderOps.push("COUNT");
          if (!validOrderOps.includes("CONCURRENCY")) validOrderOps.push("CONCURRENCY");
          
          // Check if orders reference valid operations
          for (const order of params.orders) {
            // Per docs: "The ORDER BY clauses available to you for a particular query are influenced by 
            // whether any GROUP BY or VISUALIZE clauses are also specified. If none are, you may order 
            // by any of the attributes contained in the dataset. However, once a GROUP BY or VISUALIZE 
            // clause exists, you may only order by the values generated by those clauses."
            if (order.column && !params.breakdowns?.includes(order.column) && 
                !params.calculations.some(calc => calc.column === order.column)) {
              throw new Error(`Order column '${order.column}' must be in breakdowns or calculations. According to Honeycomb docs, once a GROUP BY (breakdowns) or VISUALIZE (calculations) clause exists, you may only order by the values generated by those clauses.`);
            }
            
            if (order.op === "HEATMAP") {
              throw new Error("HEATMAP cannot be used in orders as specified in Honeycomb's documentation.");
            }
            
            if (!order.column && !["COUNT", "CONCURRENCY"].includes(order.op)) {
              throw new Error(`Operation '${order.op}' requires a column unless it is COUNT or CONCURRENCY.`);
            }
          }
        }
        
        // Validate having clauses
        if (params.having) {
          for (const having of params.having) {
            // Per docs: "The HAVING clause always refers to one of the VISUALIZE clauses."
            // Ensure the calculate_op + column combination exists in calculations
            const havingOpId = having.column 
              ? `${having.calculate_op}(${having.column})` 
              : having.calculate_op;
              
            const matchingCalculation = params.calculations.some(calc => {
              if ((calc.op === "COUNT" || calc.op === "CONCURRENCY") && 
                  having.calculate_op === calc.op) {
                return true;
              }
              
              return calc.op === having.calculate_op && calc.column === having.column;
            });
            
            if (!matchingCalculation) {
              throw new Error(`HAVING clause with calculate_op '${having.calculate_op}' ${having.column ? `and column '${having.column}'` : ''} must refer to one of the VISUALIZE (calculations) clauses. Available calculations: ${calculationIds.join(', ')}`);
            }
          }
        }
        
        // Handle time parameters
        if (params.start_time && params.end_time && params.time_range) {
          // Cannot have all three
          throw new Error("Cannot specify time_range, start_time, and end_time simultaneously. Use time_range with either start_time or end_time, or use start_time and end_time without time_range.");
        }

        const result = await api.runAnalysisQuery(params.environment, params.dataset, params);
        
        // Simplify the response to reduce context window usage
        const simplifiedResponse = {
          results: result.data?.results || [],
          // Only include series data if heatmap calculation is present (it's usually large)
          ...(hasHeatmap ? { series: result.data?.series || [] } : {}),
          
          // Include a query URL if available 
          query_url: result.links?.query_url || null,
          
          // Add summary statistics for numeric columns
          summary: summarizeResults(result.data?.results || [], params)
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedResponse, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "run_query");
      }
    }
  );

  server.tool(
    "analyze_column",
    ColumnAnalysisSchema.shape,
    async (params) => {
      try {
        const result = await api.analyzeColumn(params.environment, params.dataset, params);
        
        // Simplify the response to reduce context window usage
        interface SimplifiedColumnAnalysis {
          column: string;
          count: number;
          totalEvents: number;
          topValues?: Array<{
            value: any;
            count: number;
            percentage: string;
          }>;
          stats?: {
            min?: number;
            max?: number;
            avg?: number;
            p95?: number;
            range?: number;
            interpretation: string;
            [key: string]: any;
          };
          cardinality?: {
            uniqueCount: number;
            classification: string;
          };
          [key: string]: any; // Allow for other dynamic properties
        }
        
        const simplifiedResponse: SimplifiedColumnAnalysis = {
          column: params.column,
          count: result.data?.results?.length || 0,
          totalEvents: 0,  // Will be populated below if available
        };
        
        // Add top values if we have results
        if (result.data?.results && result.data.results.length > 0) {
          const firstResult = result.data.results[0];
          
          // Calculate total events across all results
          const totalCount = result.data.results.reduce((sum, row) => sum + (row.COUNT || 0), 0);
          simplifiedResponse.totalEvents = totalCount;
          
          // Add top values with their counts and percentages
          simplifiedResponse.topValues = result.data.results.map(row => ({
            value: row[params.column],
            count: row.COUNT || 0,
            percentage: totalCount > 0 ? ((row.COUNT || 0) / totalCount * 100).toFixed(2) + '%' : '0%'
          }));
          
          // If numeric calculations were performed, add them with additional context
          const numericMetrics = ['AVG', 'P95', 'MAX', 'MIN'];
          
          // Define the type for numericStats to match what's expected in generateInterpretation
          const numericStats: {
            min?: number;
            max?: number;
            avg?: number;
            p95?: number;
            [key: string]: number | undefined;
          } = {};
          
          numericMetrics.forEach(metric => {
            if (metric in firstResult) {
              numericStats[metric.toLowerCase()] = firstResult[metric];
            }
          });
          
          if (Object.keys(numericStats).length > 0) {
            // Add distribution information if we have numeric data
            simplifiedResponse.stats = {
              ...numericStats,
              // Calculate range if we have min and max
              ...(numericStats.min !== undefined && numericStats.max !== undefined ? 
                { range: numericStats.max - numericStats.min } : {}),
              // Add explanation based on Honeycomb's documentation
              interpretation: generateInterpretation(numericStats, params.column)
            };
          }
          
          // Add cardinality information (number of unique values)
          const uniqueValues = new Set(result.data.results.map(row => row[params.column])).size;
          simplifiedResponse.cardinality = {
            uniqueCount: uniqueValues,
            // Classification of cardinality
            classification: 
              uniqueValues <= 10 ? "low" : 
              uniqueValues <= 100 ? "medium" : 
              uniqueValues <= 1000 ? "high" : "very high"
          };
        }
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedResponse, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "analyze_column");
      }
    }
  );

  server.tool(
    "list_slos",
    DatasetArgumentsSchema.shape,
    async ({ environment, dataset }) => {
      try {
        const slos = await api.getSLOs(environment, dataset);
        // Simplify the response to reduce context window usage
        const simplifiedSLOs = slos.map(slo => ({
          id: slo.id,
          name: slo.name,
          description: slo.description || '',
          time_period_days: slo.time_period_days,
          target_per_million: slo.target_per_million,
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedSLOs, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "list_slos");
      }
    }
  );

  server.tool(
    "get_slo",
    {
      environment: z.string(),
      dataset: z.string(),
      sloId: z.string(),
    },
    async ({ environment, dataset, sloId }) => {
      try {
        const slo = await api.getSLO(environment, dataset, sloId);
        // Simplify the response to reduce context window usage
        const simplifiedSLO = {
          id: slo.id,
          name: slo.name,
          description: slo.description || '',
          time_period_days: slo.time_period_days,
          target_per_million: slo.target_per_million,
          compliance: slo.compliance,
          budget_remaining: slo.budget_remaining,
          sli: slo.sli?.alias,
          created_at: slo.created_at,
          updated_at: slo.updated_at,
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedSLO, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_slo");
      }
    }
  );

  server.tool(
    "list_triggers",
    DatasetArgumentsSchema.shape,
    async ({ environment, dataset }) => {
      try {
        const triggers = await api.getTriggers(environment, dataset);
        // Simplify the response to reduce context window usage
        const simplifiedTriggers = triggers.map(trigger => ({
          id: trigger.id,
          name: trigger.name,
          description: trigger.description || '',
          threshold: {
            op: trigger.threshold.op,
            value: trigger.threshold.value,
          },
          triggered: trigger.triggered,
          disabled: trigger.disabled,
          frequency: trigger.frequency,
          alert_type: trigger.alert_type,
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedTriggers, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "list_triggers");
      }
    }
  );

  server.tool(
    "get_trigger",
    {
      environment: z.string(),
      dataset: z.string(),
      triggerId: z.string(),
    },
    async ({ environment, dataset, triggerId }) => {
      try {
        const trigger = await api.getTrigger(environment, dataset, triggerId);
        // Simplify the response to reduce context window usage
        const simplifiedTrigger = {
          id: trigger.id,
          name: trigger.name,
          description: trigger.description || '',
          threshold: {
            op: trigger.threshold.op,
            value: trigger.threshold.value,
          },
          frequency: trigger.frequency,
          alert_type: trigger.alert_type,
          triggered: trigger.triggered,
          disabled: trigger.disabled,
          recipients: trigger.recipients.map(r => ({
            type: r.type,
            target: r.target,
          })),
          evaluation_schedule_type: trigger.evaluation_schedule_type,
          created_at: trigger.created_at,
          updated_at: trigger.updated_at,
        };
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedTrigger, null, 2),
            },
          ],
        };
      } catch (error) {
        return handleToolError(error, "get_trigger");
      }
    }
  );

  // Create transport and start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Honeycomb MCP Server running on stdio");
}

// Run main with proper error handling
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });
}

/**
 * Generate interpretation text for numeric statistics based on Honeycomb documentation
 */
function generateInterpretation(stats: {
  min?: number;
  max?: number;
  avg?: number;
  p95?: number;
  [key: string]: any
}, columnName: string): string {
  const interpretations = [];
  
  if (stats.avg !== undefined && stats.p95 !== undefined) {
    const ratio = stats.p95 / stats.avg;
    if (ratio > 3) {
      interpretations.push(`The P95 value is ${ratio.toFixed(1)}x higher than the average, suggesting significant outliers in ${columnName}.`);
    }
  }
  
  if (stats.min !== undefined && stats.max !== undefined) {
    const range = stats.max - stats.min;
    if (stats.avg !== undefined && range > stats.avg * 10) {
      interpretations.push(`The range (${range}) is very wide compared to the average (${stats.avg}), indicating high variability.`);
    }
  }
  
  if (interpretations.length === 0) {
    return `Standard distribution of ${columnName} values with expected statistical properties.`;
  }
  
  return interpretations.join(' ');
}
