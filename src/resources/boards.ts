import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { HoneycombAPI } from "../api/client.js";
import { Board } from "../types/board.js";

/**
 * Interface for MCP resource items
 */
interface ResourceItem {
  uri: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Creates and returns the boards resource template for interacting with Honeycomb boards.
 * This resource template allows users to list all boards across all environments and retrieve specific board details.
 * 
 * @param api - The Honeycomb API client instance
 * @returns A ResourceTemplate for boards
 */
export function createBoardsResource(api: HoneycombAPI) {
  return new ResourceTemplate("honeycomb://{environment}/boards/{boardId}", {
    /**
     * Lists all boards across all environments
     * 
     * @returns A list of board resources across all environments
     */
    list: async () => {
      // Get all available environments
      const environments = api.getEnvironments();
      const resources: ResourceItem[] = [];
      
      // Fetch boards from each environment
      for (const env of environments) {
        try {
          const boards = await api.getBoards(env);
          
          // Add each board as a resource
          boards.forEach((board: Board) => {
            resources.push({
              uri: `honeycomb://${env}/boards/${board.id}`,
              name: board.name,
              description: board.description || '',
              query_count: board.queries?.length || 0,
              slo_count: board.slos?.length || 0,
            });
          });
        } catch (error) {
          // Error fetching boards
        }
      }
      
      return { resources };
    }
  });
}

/**
 * Handles requests for board resources.
 * This function retrieves either a specific board with its details or a list of boards for an environment.
 * 
 * @param api - The Honeycomb API client
 * @param variables - The parsed variables from the URI template
 * @returns Board resource contents
 * @throws Error if the board cannot be retrieved
 */
export async function handleBoardResource(
  api: HoneycombAPI,
  variables: Record<string, string | string[]>
) {
  // Extract environment and boardId from variables, handling potential array values
  const environment = Array.isArray(variables.environment) 
    ? variables.environment[0] 
    : variables.environment;
    
  const boardId = Array.isArray(variables.boardId)
    ? variables.boardId[0]
    : variables.boardId;
  
  if (!environment) {
    throw new Error("Missing environment parameter");
  }
  
  if (!boardId) {
    // Return all boards for this environment
    try {
      const boards = await api.getBoards(environment);
      
      return {
        contents: boards.map(board => ({
          uri: `honeycomb://${environment}/boards/${board.id}`,
          text: JSON.stringify({
            id: board.id,
            name: board.name,
            description: board.description || '',
            style: board.style,
            column_layout: board.column_layout,
            queries: board.queries?.length > 0 ? {
              count: board.queries.length,
              datasets: [...new Set(board.queries.map(q => q.dataset).filter(Boolean))]
            } : { count: 0, datasets: [] },
            slo_count: board.slos?.length || 0,
            url: board.links?.board_url,
            created_at: board.created_at,
            updated_at: board.updated_at,
          }, null, 2),
          mimeType: "application/json"
        }))
      };
    } catch (error) {
      throw new Error(`Failed to list boards: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Return specific board with detailed information
    try {
      const board = await api.getBoard(environment, boardId);
      
      // Create a transformed version with resources properly identified
      
      // Extract a default dataset from the board if available
      // We'll use this as a fallback for queries without a specified dataset
      // If no dataset is available, fall back to "__all__" as a last resort
      const defaultDataset = board.queries?.find(q => q.dataset)?.dataset || '__all__';
      
      const boardDetails = {
        id: board.id,
        name: board.name,
        description: board.description || '',
        style: board.style,
        column_layout: board.column_layout,
        queries: await Promise.all((board.queries || []).map(async (query) => {
          // Use the query's dataset or the default dataset from the board
          const dataset = query.dataset || defaultDataset;
          
          const details: Record<string, any> = {
            caption: query.caption || 'Unnamed Query',
            dataset: dataset,
            query_style: query.query_style || 'graph',
          };
          
          // Add additional details if available
          if (query.query_id) {
            details.query_id = query.query_id;
            details.note = 'Use run_saved_query tool with environment, dataset, and queryId to run this query directly, or get_query to retrieve its definition';
            
            // Try to fetch the query details if dataset is available
            if (dataset) {
              try {
                // Parallel fetch query details and annotations
                const [queryData, queryAnnotation] = await Promise.all([
                  api.getQuery(environment, dataset, query.query_id),
                  api.getQueryAnnotation(environment, dataset, query.query_id)
                ]);
                
                // Add query definition if available
                if (queryData && queryData.query) {
                  details.query_definition = queryData.query;
                } else {
                  // Query data is empty or missing
                  details.query_fetch_error = 'Query data is empty or missing';
                }
                
                // Add query name and description from annotations if available
                if (queryAnnotation) {
                  if (queryAnnotation.name) {
                    details.name = queryAnnotation.name;
                  }
                  if (queryAnnotation.description) {
                    details.description = queryAnnotation.description;
                  }
                }
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                // Failed to fetch query
                details.query_fetch_error = `Could not fetch query definition: ${errorMessage}`;
              }
            }
          }
          
          if (query.visualization_settings) {
            details.visualization_settings = query.visualization_settings;
          }
          
          if (query.graph_settings) {
            details.graph_settings = query.graph_settings;
          }
          
          return details;
        })),
        slos: await Promise.all((board.slos || []).map(async (sloId) => {
          // Get the dataset from the first query if available, otherwise use a placeholder
          const dataset = board.queries?.[0]?.dataset || '';
          let sloDetails: Record<string, any> = {
            id: sloId,
            note: 'Use get-slo tool to retrieve full details about this SLO'
          };
          
          if (dataset) {
            try {
              const slo = await api.getSLO(environment, dataset, sloId);
              if (slo) {
                sloDetails = {
                  ...sloDetails,
                  name: slo.name,
                  description: slo.description,
                  time_period_days: slo.time_period_days,
                  target_per_million: slo.target_per_million,
                  budget_remaining: slo.budget_remaining,
                  compliance: slo.compliance
                };
              }
            } catch (error) {
              sloDetails.fetch_error = 'Could not fetch SLO details';
            }
          } else {
            sloDetails.fetch_error = 'No dataset available to fetch SLO';
          }
          
          return sloDetails;
        })),
        url: board.links?.board_url,
        created_at: board.created_at,
        updated_at: board.updated_at,
      };
      
      return {
        contents: [{
          uri: `honeycomb://${environment}/boards/${boardId}`,
          text: JSON.stringify(boardDetails, null, 2),
          mimeType: "application/json"
        }]
      };
    } catch (error) {
      throw new Error(`Failed to read board: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}