import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ColumnAnalysisSchema } from "../types/schema.js";
import { generateInterpretation, getCardinalityClassification } from "../utils/analysis.js";
import { 
  SimplifiedColumnAnalysis, 
  NumericStatistics, 
  NumericStatsWithInterpretation 
} from "../types/analysis.js";
import { QueryResultValue } from "../types/query.js";

const description = `Analyzes specific columns in a dataset by running statistical queries and returning computed metrics.
This tool allows users to get statistical information about a specific column, including value distribution, top values, and numeric statistics (for numeric columns).
Supports analyzing up to 10 columns at once by specifying an array of column names in the 'columns' parameter.
When multiple columns are specified, they will be analyzed together as a group, showing the distribution of their combined values.
Use this tool before running queries to get a better understanding of the data in your dataset.
`

/**
 * Creates a tool for analyzing multiple columns in a Honeycomb dataset
 * 
 * This tool allows users to get statistical information about specific columns,
 * including value distribution, top values, and numeric statistics (for numeric columns).
 * It can analyze up to 10 columns at once.
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createAnalyzeColumnsTool(api: HoneycombAPI) {
  return {
    name: "analyze_columns",
    description,
    schema: ColumnAnalysisSchema.shape,
    /**
     * Handles the analyze_column tool request
     * 
     * @param params - The parameters for the column analysis
     * @returns A formatted response with column analysis data
     */
    handler: async (params: z.infer<typeof ColumnAnalysisSchema>) => {
      try {
        // Validate required parameters
        if (!params.environment) {
          throw new Error("Missing required parameter: environment");
        }
        if (!params.dataset) {
          throw new Error("Missing required parameter: dataset");
        }
        if (!params.columns || params.columns.length === 0) {
          throw new Error("Missing required parameter: columns");
        }
        if (params.columns.length > 10) {
          throw new Error("Too many columns requested. Maximum is 10.");
        }
        
        // Execute the analysis via the API
        const result = await api.analyzeColumns(params.environment, params.dataset, params);
        
        // Initialize the response
        const simplifiedResponse: SimplifiedColumnAnalysis = {
          columns: params.columns,
          count: result.data?.results?.length || 0,
          totalEvents: 0,  // Will be populated below if available
        };
        
        // Add top values if we have results
        if (result.data?.results && result.data.results.length > 0) {
          const results = result.data.results as QueryResultValue[];
          const firstResult = results[0];
          
          try {
            // Calculate total events across all results
            const totalCount = results.reduce((sum, row) => {
              const count = row.COUNT as number | undefined;
              // Only add if it's a number, otherwise use 0
              return sum + (typeof count === 'number' ? count : 0);
            }, 0);
            simplifiedResponse.totalEvents = totalCount;
            
            // Add top values with their counts and percentages
            simplifiedResponse.topValues = results.map(row => {
              // For multi-column analysis, combine values into a descriptive string
              const combinedValue = params.columns
                .map(col => {
                  const colValue = row[col] !== undefined ? row[col] : null;
                  return `${col}: ${colValue}`;
                })
                .join(', ');
              
              const count = typeof row.COUNT === 'number' ? row.COUNT : 0;
              
              return {
                value: combinedValue,
                count,
                percentage: totalCount > 0 ? 
                  ((count / totalCount) * 100).toFixed(2) + '%' : 
                  '0%'
              };
            });
            
            // Initialize stats container for each numeric column
            const numericStats: Record<string, NumericStatsWithInterpretation> = {};
            
            // Process numeric metrics for each column if available
            if (firstResult) {
              params.columns.forEach(column => {
                // Check if we have numeric metrics for this column
                const avgKey = `AVG(${column})`;
                if (avgKey in firstResult) {
                  const stats: NumericStatistics = {};
                  
                  // Extract metrics for this column
                  if (typeof firstResult[avgKey] === 'number') stats.avg = firstResult[avgKey] as number;
                  if (typeof firstResult[`P95(${column})`] === 'number') stats.p95 = firstResult[`P95(${column})`] as number;
                  if (typeof firstResult[`MAX(${column})`] === 'number') stats.max = firstResult[`MAX(${column})`] as number;
                  if (typeof firstResult[`MIN(${column})`] === 'number') stats.min = firstResult[`MIN(${column})`] as number;
                  
                  // Calculate range if we have min and max
                  if (stats.min !== undefined && stats.max !== undefined) {
                    stats.range = stats.max - stats.min;
                  }
                  
                  // Only add if we have at least one stat
                  if (Object.keys(stats).length > 0) {
                    numericStats[column] = {
                      ...stats,
                      interpretation: generateInterpretation(stats, column)
                    } as NumericStatsWithInterpretation;
                  }
                }
              });
            }
            
            // Add stats if we have any
            if (Object.keys(numericStats).length > 0) {
              simplifiedResponse.stats = numericStats;
            }
            
            // Add cardinality information (unique combinations of values)
            const uniqueValueCombinations = new Set();
            
            results.forEach(row => {
              const combinationKey = params.columns
                .map(col => `${col}:${row[col] !== undefined ? row[col] : 'null'}`)
                .join('|');
              uniqueValueCombinations.add(combinationKey);
            });
            
            const uniqueCount = uniqueValueCombinations.size;
            
            simplifiedResponse.cardinality = {
              uniqueCount,
              classification: getCardinalityClassification(uniqueCount)
            };
          } catch (processingError) {
            // Handle errors during result processing, but still return partial results
            console.error("Error processing column analysis results:", processingError);
            simplifiedResponse.processingError = `Error processing results: ${processingError instanceof Error ? processingError.message : String(processingError)}`;
          }
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
        return handleToolError(error, "analyze_columns");
      }
    }
  };
}
