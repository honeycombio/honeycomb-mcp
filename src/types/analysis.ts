/**
 * Cardinality classification for column values
 */
export type CardinalityClassification = 'low' | 'medium' | 'high' | 'very high';

/**
 * Interface for statistics used in analysis and interpretation
 */
export interface NumericStatistics {
  min?: number;
  max?: number;
  avg?: number;
  p50?: number;
  p90?: number;
  p95?: number;
  p99?: number;
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
 * Value with count representation
 */
export interface TopValue {
  value: string | number | boolean | null;
  count: number;
}

/**
 * Simplified column analysis result
 */
export interface SimplifiedColumnAnalysis {
  /** The name of the column being analyzed */
  name: string;
  /** The data type of the column */
  type: string;
  /** Number of samples analyzed */
  sample_count: number;
  /** Number of unique values */
  unique_count: number;
  /** Cardinality classification */
  cardinality: CardinalityClassification;
  /** Most frequent values with counts */
  top_values?: TopValue[];
  /** Statistical information for numeric columns */
  numeric_stats?: NumericStatsWithInterpretation;
  /** Error message if analysis failed */
  error?: string;
}