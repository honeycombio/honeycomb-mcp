import { z } from "zod";
import { HoneycombAPI } from "../api/client.js";
import { createTool } from "../utils/tool-factory.js";
import { getInstrumentationGuidance } from "../prompts/guidance.js";

/**
 * Schema for the instrumentation guidance tool
 */
export const InstrumentationGuidanceSchema = z.object({
  language: z.string().optional().describe("Programming language of the code to instrument"),
  filepath: z.string().optional().describe("Path to the file being instrumented")
});

/**
 * Creates a tool for providing OpenTelemetry instrumentation guidance.
 * 
 * @param api - The Honeycomb API client
 * @returns A configured tool object with name, schema, and handler
 */
export function createInstrumentationGuidanceTool(api: HoneycombAPI) {
  return createTool(api, {
    name: "get_instrumentation_help",
    description: "Provides important guidance for how to instrument code with OpenTelemetry traces and logs. It is intended to be used when someone wants to instrument their code, or improve instrumentation (such as getting advice on improving their logs or tracing, or creating new instrumentation). It is BEST used after inspecting existing code and telemetry data to understand some operational characteristics. However, if there is no telemetry data to read from Honeycomb, it can still provide guidance on how to instrument code.",
    schema: InstrumentationGuidanceSchema,
    
    /**
     * Handles the instrumentation_guidance tool request
     * 
     * @param params - The parameters for the instrumentation guidance
     * @returns A formatted response with instrumentation guidance
     */
    handler: async (params: z.infer<typeof InstrumentationGuidanceSchema>) => {
      // Get the instrumentation guidance template
      const guidance = getInstrumentationGuidance();
      
      const language = params?.language || "your code";
      const filepath = params?.filepath
        ? ` for ${params.filepath}`
        : "";
        
      return {
        content: [
          {
            type: "text",
            text: `# Instrumentation Guidance for ${language}${filepath}\n\n${guidance}`,
          },
        ],
      };
    },
    
    // Add error context
    errorContext: (params: z.infer<typeof InstrumentationGuidanceSchema>) => ({
      language: params.language,
      filepath: params.filepath
    })
  });
}
