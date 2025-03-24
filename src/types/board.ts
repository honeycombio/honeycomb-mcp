/**
 * Interface for a board query (used within a Board)
 */
export interface BoardQuery {
  caption?: string;
  query_style?: 'graph' | 'table' | 'combo';
  dataset?: string;
  query_id?: string;
  visualization_settings?: Record<string, any>;
  graph_settings?: {
    hide_markers?: boolean;
    log_scale?: boolean;
    omit_missing_values?: boolean;
    stacked_graphs?: boolean;
    utc_xaxis?: boolean;
    overlaid_charts?: boolean;
  };
}

/**
 * Interface for a Honeycomb board (dashboard)
 */
export interface Board {
  id: string;
  name: string;
  description?: string;
  style?: string;
  column_layout?: 'multi' | 'single';
  queries?: BoardQuery[];
  slos?: string[];
  links?: {
    board_url?: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Response type for listing boards
 * 
 * Note: The API docs suggest this response structure, but the actual API
 * might return an array directly. We handle both cases in the client code.
 */
export interface BoardsResponse {
  boards: Board[];
}