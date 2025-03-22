import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ColumnAnalysisSchema } from "../types/schema.js";
import { generateInterpretation, NumericStatistics } from "../utils/analysis.js";
import { SimplifiedColumnAnalysis, CardinalityClassification } from "../types/analysis.js";
import { QueryResultValue } from "../types/query.js";

/**
 * Determine cardinality classification based on the number of unique values
 * 
 * @param uniqueCount - The number of unique values in the dataset
 * @returns A classification of the cardinality (low, medium, high, very high)
 */
function getCardinalityClassification(uniqueCount: number): CardinalityClassification {
  if (uniqueCount <= 10) return 'low';
  if (uniqueCount <= 100) return 'medium';
  if (uniqueCount <= 1000) return 'high';
  return 'very high';
}

/**
 * Creates a tool for analyzing a column in a Honeycomb dataset
 * 
 * This tool allows users to get statistical information about a specific column,
 * including value distribution, top values, and numeric statistics (for numeric columns).
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createAnalyzeColumnTool(api: HoneycombAPI) {
  return {
    name: "analyze_column",
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
        if (!params.column) {
          throw new Error("Missing required parameter: column");
        }
        
        // Execute the analysis via the API
        const result = await api.analyzeColumn(params.environment, params.dataset, params);
        
        // Initialize the response
        const simplifiedResponse: SimplifiedColumnAnalysis = {
          column: params.column,
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
              // Get the value, defaulting to null if undefined
              const value: string | number | boolean | null = 
                row[params.column] !== undefined ? row[params.column] as string | number | boolean | null : null;
              const count = typeof row.COUNT === 'number' ? row.COUNT : 0;
              
              return {
                value,
                count,
                percentage: totalCount > 0 ? 
                  ((count / totalCount) * 100).toFixed(2) + '%' : 
                  '0%'
              };
            });
            
            // If numeric calculations were performed, add them with additional context
            const numericMetrics = ['AVG', 'P95', 'MAX', 'MIN'];
            
            // Use NumericStatistics from our type definition
            const numericStats: NumericStatistics = {};
            
            // Only process metrics if we have a first result
            if (firstResult) {
              numericMetrics.forEach(metric => {
                if (metric in firstResult) {
                  const value = firstResult[metric];
                  // Only assign if it's a number
                  if (typeof value === 'number') {
                    const key = metric.toLowerCase() as keyof NumericStatistics;
                    numericStats[key] = value;
                  }
                }
              });
            }
            
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
            // Guard against empty or malformed results
            const uniqueValueSet = new Set(
              results
                .filter(row => row && typeof row === 'object')
                .map(row => row[params.column])
            );
            const uniqueValues = uniqueValueSet.size;
            
            simplifiedResponse.cardinality = {
              uniqueCount: uniqueValues,
              // Classification of cardinality
              classification: getCardinalityClassification(uniqueValues)
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
        return handleToolError(error, "analyze_column");
      }
    }
  };
}
