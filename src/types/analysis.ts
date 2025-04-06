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
 * Interface for statistics used in analysis and interpretation
 */
export interface NumericStatistics {
  min?: number;
  max?: number;
  avg?: number;
  p95?: number;
  median?: number;
  sum?: number;
  range?: number;
  stdDev?: number;
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
  /** The names of the columns being analyzed */
  columns: string[];
  /** The number of results returned in the analysis */
  count: number;
  /** Total number of events/records across all results */
  totalEvents: number;
  /** Most frequent values in the columns with their counts */
  topValues?: Array<ValueWithPercentage>;
  /** Statistical information for numeric columns */
  stats?: Record<string, NumericStatsWithInterpretation>;
  /** Information about how many unique combinations exist */
  cardinality?: CardinalityInfo;
  /** Any error that occurred during result processing */
  processingError?: string;
}