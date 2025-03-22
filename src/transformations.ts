/**
 * Types for the summary statistics
 */
interface NumericStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  sum: number;
}

interface CountStats {
  total: number;
  max: number;
  min: number;
  avg: number;
}

interface BreakdownStat {
  uniqueCount: number;
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
export function summarizeResults(results: any[], params: any): ResultSummary {
  if (!results || results.length === 0) {
    return { count: 0 };
  }
  
  const summary: ResultSummary = {
    count: results.length,
  };

  // If we have calculation columns, add some statistics about them
  if (params.calculations) {
    const numericColumns = params.calculations
      .filter((calc: any) => 
        calc.op !== "COUNT" && 
        calc.op !== "CONCURRENCY" && 
        calc.op !== "HEATMAP" &&
        calc.column
      )
      .map((calc: any) => `${calc.op}(${calc.column})`);
    
    numericColumns.forEach((colName: string) => {
      if (results[0] && colName in results[0]) {
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
          
          // Now properly typed
          summary[colName] = { 
            min, 
            max, 
            avg,
            median,
            sum
          } as NumericStats;
        }
      }
    });
    
    // Special handling for COUNT operations
    const hasCount = params.calculations.some((calc: any) => calc.op === "COUNT");
    if (hasCount && results.length > 0 && 'COUNT' in results[0]) {
      const countValues = results.map(r => r.COUNT).filter(v => v !== null && v !== undefined);
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
        uniqueCount: uniqueValues.size
      };
    });
    
    summary.breakdowns = breakdownStats;
  }
  
  return summary;
}