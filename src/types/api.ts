export interface Resource {
  uri: string;
  name: string;
  description: string;
}

export interface Dataset {
  name: string;
  slug: string;
  description?: string;
  settings?: {
    delete_protected?: boolean;
  };
  expand_json_depth?: number;
  regular_columns_count?: number;
  last_written_at?: string | null;
  created_at: string;
}

export interface DatasetWithColumns extends Dataset {
  columns: {
    name: string;
    type: string;
    description?: string;
  }[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface PromptDefinition {
  name: string;
  description: string;
  arguments: {
    name: string;
    description: string;
    required: boolean;
  }[];
}

export interface MessageContent {
  type: "text";
  text: string;
}

export interface ToolResponse {
  content: MessageContent[];
}

export interface PromptResponse {
  messages: {
    role: "user";
    content: MessageContent;
  }[];
}

export interface AuthResponse {
  id: string;
  type: string;
  api_key_access: Record<string, boolean>;
  environment?: {
    name: string;
    slug: string;
  };
  team?: {
    name: string;
    slug: string;
  };
}

export interface QueryOptions {
  includeSeries?: boolean;
  limit?: number;
}
