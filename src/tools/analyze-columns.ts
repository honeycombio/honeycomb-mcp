import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { ColumnAnalysisSchema } from "../types/query-schemas.js";
import { generateInterpretation, getCardinalityClassification } from "../utils/analysis.js";
import { 
  NumericStatistics, 
  NumericStatsWithInterpretation,
  SimplifiedColumnAnalysis
} from "../types/analysis.js";
import { createTool } from "../utils/tool-factory.js";
import { executeWithRetry } from "../utils/query-handler.js";

/**
 * Tool to analyze a specific column in a dataset by running statistical queries and returning computed metrics.
 * 
 * This tool allows users to get statistical information about specific columns, including value distribution,
 * top values, and numeric statistics (for numeric columns).
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createAnalyzeColumnsTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "analyze_columns",
    description: "Analyzes specific columns in a dataset by running statistical queries and returning computed metrics. For numeric columns, includes min/max/avg/percentiles; for string columns, includes value distribution and cardinality analysis.",
    schema: ColumnAnalysisSchema,
    
    handler: async (params: z.infer<typeof ColumnAnalysisSchema>, api) => {
      // Extract parameters
      const { environment, dataset, columns, timeRange } = params;
      
      // Validate parameters
      if (!environment) {
        throw new Error("Missing required parameter: environment");
      }
      if (!dataset) {
        throw new Error("Missing required parameter: dataset");
      }
      if (!columns || columns.length === 0) {
        throw new Error("Missing required parameter: columns (must be an array with at least one column name)");
      }
      if (columns.length > 10) {
        throw new Error("Too many columns: maximum 10 columns can be analyzed at once");
      }
      
      // Check if the columns exist in the dataset
      const availableColumns = await api.getVisibleColumns(environment, dataset);
      const availableColumnNames = availableColumns.map(col => col.key_name);
      
      const invalidColumns = columns.filter(col => !availableColumnNames.includes(col));
      if (invalidColumns.length > 0) {
        throw new Error(`Invalid column(s): ${invalidColumns.join(', ')} not found in dataset ${dataset}`);
      }
      
      // Analyze each column
      const results: Record<string, SimplifiedColumnAnalysis> = {};
      
      // Use Promise.all to run all column analyses in parallel
      await Promise.all(columns.map(async (column) => {
        try {
          const columnResult = await executeWithRetry(async () => {
            return await api.analyzeColumn(environment, dataset, column, timeRange);
          });
          
          const columnInfo = availableColumns.find(c => c.key_name === column)!;
          const columnType = columnInfo.type;
          
          // Process the results based on column type
          const processedResult: SimplifiedColumnAnalysis = {
            name: column,
            type: columnType,
            sample_count: columnResult.sample_count || 0,
            unique_count: columnResult.unique_count || 0,
            cardinality: getCardinalityClassification(columnResult.unique_count || 0),
          };
          
          // Add type-specific metrics
          if (columnResult.top_values) {
            processedResult.top_values = columnResult.top_values;
          }
          
          if (columnType === 'float' || columnType === 'integer') {
            // Create numeric stats with interpretations
            const numericStats: NumericStatistics = {
              min: columnResult.min,
              max: columnResult.max,
              avg: columnResult.avg, 
              p50: columnResult.p50,
              p90: columnResult.p90,
              p95: columnResult.p95,
              p99: columnResult.p99
            };
            
            const statsWithInterpretation: NumericStatsWithInterpretation = {
              ...numericStats,
              interpretation: generateInterpretation(numericStats, column)
            };
            
            processedResult.numeric_stats = statsWithInterpretation;
          }
          
          // Add the result to the overall results
          results[column] = processedResult;
        } catch (columnError) {
          // Handle individual column errors, but continue processing other columns
          console.error(`Error analyzing column ${column}:`, columnError);
          results[column] = {
            name: column,
            type: availableColumns.find(c => c.key_name === column)?.type || 'unknown',
            error: columnError instanceof Error ? columnError.message : String(columnError)
          };
        }
      }));
      
      // Return the analysis results
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              environment,
              dataset,
              time_range: timeRange || 7200, // default 2 hours
              columns: results
            }, null, 2),
          },
        ],
      };
    },
    
    errorContext: (params) => ({
      environment: params.environment,
      dataset: params.dataset
    })
  });
}