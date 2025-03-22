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
  column: string;
  count: number;
  totalEvents: number;
  topValues?: Array<ValueWithPercentage>;
  stats?: NumericStatsWithInterpretation;
  cardinality?: CardinalityInfo;
}