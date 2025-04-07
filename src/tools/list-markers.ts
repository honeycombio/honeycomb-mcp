import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { ListMarkersSchema } from "../types/collection-schemas.js";
import { createTool } from "../utils/tool-factory.js";
import { handleCollection } from "../utils/collection.js";

/**
 * Tool to list markers (deployment events) in a Honeycomb environment. This tool returns a list of all markers available in the specified environment, including their IDs, messages, types, URLs, creation times, start times, and end times.
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListMarkersTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "list_markers",
    description: "Lists available markers (deployment events) for a specific environment with pagination, sorting, and search support. Returns marker details including type, message, URLs, and timestamps.",
    schema: ListMarkersSchema,
    
    handler: async (params: z.infer<typeof ListMarkersSchema>, api) => {
      // Validate input parameters
      if (!params.environment) {
        throw new Error("environment parameter is required");
      }

      // Fetch markers from the API
      const markers = await api.getMarkers(params.environment);
      
      // Create a simplified response
      const simplifiedMarkers = markers.map(marker => ({
        id: marker.id,
        message: marker.message || "",
        type: marker.type || "deploy",
        url: marker.url || null,
        created_at: marker.created_at,
        start_time: marker.start_time,
        end_time: marker.end_time || null,
      }));
      
      // For backward compatibility with tests
      if (!params.page && !params.limit && !params.search && !params.sort_by) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedMarkers, null, 2),
            },
          ],
          metadata: {
            count: simplifiedMarkers.length,
            environment: params.environment
          }
        };
      }
      
      // Use the shared collection handler
      return handleCollection(
        params.environment,
        'marker',
        simplifiedMarkers,
        params,
        ['message', 'type']
      );
    },
    
    errorContext: (params) => ({
      environment: params.environment
    })
  });
}