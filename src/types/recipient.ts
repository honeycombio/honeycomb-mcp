/**
 * Interface for notification recipient types
 */
export type RecipientType = 
  | "email" 
  | "slack" 
  | "pagerduty" 
  | "webhook" 
  | "msteams" 
  | "msteams_workflow";

/**
 * Interface for a notification recipient
 */
export interface Recipient {
  id: string;
  name: string;
  type: RecipientType;
  target?: string;
  details?: {
    pagerduty_severity?: "critical" | "error" | "warning" | "info";
    url?: string;
  };
  created_at: string;
  updated_at: string;
}

/**
 * Response type for listing recipients
 */
export interface RecipientsResponse {
  recipients: Recipient[];
}
