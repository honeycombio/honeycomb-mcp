/**
 * Interface for a Honeycomb marker (deployment event)
 */
export interface Marker {
  id: string;
  message: string;
  type: string;
  url?: string;
  created_at: string;
  start_time: string;
  end_time?: string;
}

/**
 * Response type for listing markers
 */
export interface MarkersResponse {
  markers: Marker[];
}
