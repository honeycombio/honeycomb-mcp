import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { handleToolError } from "../utils/tool-error.js";
import { ListMarkersSchema } from "../types/schema.js";

/**
 * Tool to list markers (deployment events) in a Honeycomb environment
 * 
 * @param api - The Honeycomb API client
 * @returns An MCP tool object with name, schema, and handler function
 */
export function createListMarkersTool(api: HoneycombAPI) {
  return {
    name: "list_markers",
    schema: ListMarkersSchema.shape,
    /**
     * Handler for the list_markers tool
     * 
     * @param params - The parameters for the tool
     * @param params.environment - The Honeycomb environment
     * @returns List of markers with relevant metadata
     */
    handler: async ({ environment }: z.infer<typeof ListMarkersSchema>) => {
      // Validate input parameters
      if (!environment) {
        return handleToolError(new Error("environment parameter is required"), "list_markers");
      }

      try {
        // Fetch markers from the API
        const markers = await api.getMarkers(environment);
        
        // Create a simplified response
        const simplifiedMarkers = markers.map(marker => ({
          id: marker.id,
          message: marker.message,
          type: marker.type,
          url: marker.url || '',
          created_at: marker.created_at,
          start_time: marker.start_time,
          end_time: marker.end_time || '',
        }));
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(simplifiedMarkers, null, 2),
            },
          ],
          metadata: {
            count: simplifiedMarkers.length,
            environment
          }
        };
      } catch (error) {
        return handleToolError(error, "list_markers");
      }
    }
  };
}