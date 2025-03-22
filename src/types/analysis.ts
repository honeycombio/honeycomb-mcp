import { TopValueItem } from '../utils/functions.js';
import { NumericStatistics } from '../utils/analysis.js';

/**
 * Cardinality classification for column values
 */
export type CardinalityClassification = 'low' | 'medium' | 'high' | 'very high';

/**
 * Information about column value cardinality
 */
export interface CardinalityInfo {
  uniqueCount: number;
  classification: CardinalityClassification;
}

/**
 * Numeric statistics with interpretation
 */
export interface NumericStatsWithInterpretation extends NumericStatistics {
  interpretation: string;
}

/**
 * Value with count and percentage representation
 */
export interface ValueWithPercentage {
  value: string | number | boolean | null;
  count: number;
  percentage: string;
}

/**
 * Simplified column analysis result
 */
export interface SimplifiedColumnAnalysis {
  /** The name of the column being analyzed */
  column: string;
  /** The number of results returned in the analysis */
  count: number;
  /** Total number of events/records across all results */
  totalEvents: number;
  /** Most frequent values in the column with their counts */
  topValues?: Array<ValueWithPercentage>;
  /** Statistical information for numeric columns */
  stats?: NumericStatsWithInterpretation;
  /** Information about how many unique values exist in the column */
  cardinality?: CardinalityInfo;
  /** Any error that occurred during result processing */
  processingError?: string;
}