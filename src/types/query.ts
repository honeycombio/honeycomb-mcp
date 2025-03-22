export interface QueryCalculation {
  op: string;
  column?: string;
}

export type FilterOperator =
  | "="
  | "!="
  | ">"
  | ">="
  | "<"
  | "<="
  | "starts-with"
  | "does-not-start-with"
  | "ends-with"
  | "does-not-end-with"
  | "exists"
  | "does-not-exist"
  | "contains"
  | "does-not-contain"
  | "in"
  | "not-in";

export interface QueryFilter {
  column: string;
  op: FilterOperator;
  value?: string | number | boolean | string[] | number[];
}

export type QueryOrderDirection = "ascending" | "descending";

export interface QueryOrder {
  column?: string;
  op: string;
  order: QueryOrderDirection;
}

export interface QueryHaving {
  calculate_op: string;
  column?: string;
  op: string;
  value: number;
}

export interface AnalysisQuery {
  calculations: QueryCalculation[];
  breakdowns?: string[];
  filters?: QueryFilter[];
  filter_combination?: "AND" | "OR";
  orders?: QueryOrder[];
  limit?: number;
  time_range?: number;
  start_time?: number;
  end_time?: number;
  granularity?: number;
  having?: QueryHaving[];
}

interface QueryResultData {
  results?: QueryResultValue[];
  series?: QuerySeriesValue[];
}

export interface QueryResult {
  data?: QueryResultData;
  links?: {
    query_url?: string;
    graph_image_url?: string;
  };
  complete: boolean;
  id: string;
}

export interface QueryResultValue {
  [key: string]: string | number | boolean | null;
}

export interface QuerySeriesValue {
  [key: string]: string | number | boolean | null;
}

export interface QueryResponse {
  id: string;
  complete: boolean;
  data?: {
    results: QueryResultValue[];
    series: QuerySeriesValue[];
  };
  links?: {
    query_url?: string;
    graph_image_url?: string;
  };
}
