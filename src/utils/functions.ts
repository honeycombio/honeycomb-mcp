import { QueryResultValue } from "../types/query.js";

/**
 * Calculate standard deviation for an array of values
 */
export function calculateStdDev(values: number[], mean: number): number {
  if (values.length <= 1) return 0;
  
  const squareDiffs = values.map(value => {
    const diff = value - mean;
    return diff * diff;
  });
  
  const avgSquareDiff = squareDiffs.reduce((sum, value) => sum + value, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Interface for top value result items
 */
export interface TopValueItem<T = unknown> {
  value: T;
  count: number;
}

/**
 * Get top N values with their frequencies
 */
export function getTopValues(results: QueryResultValue[], column: string, limit: number = 5): Array<TopValueItem> {
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