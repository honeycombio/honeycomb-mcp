import { calculateStdDev, getTopValues, TopValueItem } from "./functions.js";
import { QueryResultValue } from "../types/query.js";
import { z } from "zod";
import { QueryToolSchema } from "../types/schema.js";
import { isValidNumber } from "./typeguards.js";

/**
 * Types for the summary statistics
 */
interface NumericStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  sum: number;
  range?: number;
  stdDev?: number;
}

interface CountStats {
  total: number;
  max: number;
  min: number;
  avg: number;
}

interface BreakdownStat {
  uniqueCount: number;
  topValues?: Array<TopValueItem>;
}

interface BreakdownStats {
  [column: string]: BreakdownStat;
}

interface ResultSummary {
  count: number;
  countStats?: CountStats;
  breakdowns?: BreakdownStats;
  [calculationColumn: string]: NumericStats | number | CountStats | BreakdownStats | undefined;
}

/**
 * Calculate summary statistics for query results to provide useful insights
 * without overwhelming the context window
 */
export function summarizeResults(results: QueryResultValue[], params: z.infer<typeof QueryToolSchema>): ResultSummary {
  if (!results || results.length === 0) {
    return { count: 0 };
  }
  
  const summary: ResultSummary = {
    count: results.length,
  };

  // If we have calculation columns, add some statistics about them
  if (params.calculations) {
    const numericColumns = params.calculations
      .filter(calc => 
        calc.op !== "COUNT" && 
        calc.op !== "CONCURRENCY" && 
        calc.op !== "HEATMAP" &&
        calc.column
      )
      .map(calc => `${calc.op}(${calc.column})`);
    
    numericColumns.forEach((colName: string) => {
      if (results[0] && colName in results[0]) {
        // Filter to ensure we only have numeric values
        const values = results
          .map(r => r[colName])
          .filter(isValidNumber);
          
        if (values.length > 0) {
          const min = Math.min(...values);
          const max = Math.max(...values);
          const sum = values.reduce((a, b) => a + b, 0);
          const avg = sum / values.length;
          
          // Calculate median (P50 approximation)
          const sortedValues = [...values].sort((a, b) => a - b);
          
          // Default to average if we can't calculate median properly
          let median = avg;
          
          // We know values is not empty at this point because we checked values.length > 0 earlier
          if (sortedValues.length === 1) {
            median = sortedValues[0]!;
          } else if (sortedValues.length > 1) {
            const medianIndex = Math.floor(sortedValues.length / 2);
            
            if (sortedValues.length % 2 === 0) {
              // Even number of elements - average the middle two
              // We can use non-null assertion (!) because we know these indices exist
              // when sortedValues.length > 1 and we're in the even case
              median = (sortedValues[medianIndex - 1]! + sortedValues[medianIndex]!) / 2;
            } else {
              // Odd number of elements - take the middle one
              // We can use non-null assertion (!) because we know this index exists
              median = sortedValues[medianIndex]!;
            }
          }
          
          // Create a properly typed NumericStats object
          const stats: NumericStats = { 
            min, 
            max, 
            avg,
            median,
            sum,
            range: max - min,
            stdDev: calculateStdDev(values, avg)
          };
          summary[colName] = stats;
        }
      }
    });
    
    // Special handling for COUNT operations
    const hasCount = params.calculations.some(calc => calc.op === "COUNT");
    if (hasCount && results.length > 0 && 'COUNT' in results[0]!) {
      // Filter to ensure we only have numeric values
      const countValues = results
        .map(r => r.COUNT)
        .filter(isValidNumber);
        
      if (countValues.length > 0) {
        const totalCount = countValues.reduce((a, b) => a + b, 0);
        const maxCount = Math.max(...countValues);
        const minCount = Math.min(...countValues);
        
        // Now properly typed
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
    const breakdownStats: BreakdownStats = {};
    
    params.breakdowns.forEach((col: string) => {
      const uniqueValues = new Set(results.map(r => r[col]));
      breakdownStats[col] = {
        uniqueCount: uniqueValues.size,
        topValues: getTopValues(results, col, 5)
      };
    });
    
    summary.breakdowns = breakdownStats;
  }
  
  return summary;
}