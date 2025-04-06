import { CardinalityClassification, NumericStatistics } from "../types/analysis.js";


/**
 * Determine cardinality classification based on the number of unique values
 * 
 * @param uniqueCount - The number of unique values in the dataset
 * @returns A classification of the cardinality (low, medium, high, very high)
 */
export function getCardinalityClassification(uniqueCount: number): CardinalityClassification {
  if (uniqueCount <= 10) return 'low';
  if (uniqueCount <= 100) return 'medium';
  if (uniqueCount <= 1000) return 'high';
  return 'very high';
}

/**
 * Generate interpretation text for numeric statistics based on Honeycomb documentation
 */
export function generateInterpretation(stats: NumericStatistics, columnName: string): string {
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