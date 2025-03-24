import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createListMarkersTool } from "./list-markers.js";
import { HoneycombAPI } from "../api/client.js";

// Mock the API client
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => ({
      getMarkers: vi.fn(),
    })),
  };
});

describe("list-markers tool", () => {
  let api: HoneycombAPI;

  beforeEach(() => {
    api = new HoneycombAPI({} as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a list of markers", async () => {
    const mockMarkers = [
      {
        id: "marker-1",
        message: "Deployed v1.2.3",
        type: "deploy",
        url: "https://github.com/example/repo/releases/tag/v1.2.3",
        created_at: "2023-01-01T00:00:00Z",
        start_time: "2023-01-01T00:00:00Z",
        end_time: "2023-01-01T00:05:00Z",
      },
      {
        id: "marker-2",
        message: "Feature flag enabled",
        type: "feature",
        url: "",
        created_at: "2023-01-03T00:00:00Z",
        start_time: "2023-01-03T00:00:00Z",
        end_time: "",
      },
    ];

    vi.mocked(api.getMarkers).mockResolvedValue(mockMarkers);

    const tool = createListMarkersTool(api);
    const result = await tool.handler({ environment: "test-env" });

    expect(api.getMarkers).toHaveBeenCalledWith("test-env");
    
    // Type assertion to tell TypeScript this is a success result with metadata
    const successResult = result as { 
      content: { type: string; text: string }[]; 
      metadata: { count: number; environment: string } 
    };
    
    expect(successResult.content).toHaveLength(1);
    // Add a check that text property exists before attempting to parse it
    expect(successResult.content[0]?.text).toBeDefined();
    const content = JSON.parse(successResult.content[0]?.text || '[]');
    expect(content).toHaveLength(2);
    expect(content[0].id).toBe("marker-1");
    expect(content[1].message).toBe("Feature flag enabled");
    expect(successResult.metadata.count).toBe(2);
  });

  it("handles API errors", async () => {
    const mockError = new Error("API error");
    vi.mocked(api.getMarkers).mockRejectedValue(mockError);
    
    // Mock console.error to prevent error messages during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const tool = createListMarkersTool(api);
    const result = await tool.handler({ environment: "test-env" });
    
    // Restore console.error
    consoleErrorSpy.mockRestore();

    // Type assertion to tell TypeScript this is an error result
    const errorResult = result as { 
      content: { type: string; text: string }[]; 
      error: { message: string } 
    };

    expect(errorResult.error).toBeDefined();
    expect(errorResult.error.message).toContain("API error");
  });

  it("requires the environment parameter", async () => {
    // Mock console.error to prevent error messages during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const tool = createListMarkersTool(api);
    const result = await tool.handler({ environment: "" });
    
    // Restore console.error
    consoleErrorSpy.mockRestore();

    // Type assertion to tell TypeScript this is an error result
    const errorResult = result as { 
      content: { type: string; text: string }[]; 
      error: { message: string } 
    };

    expect(errorResult.error).toBeDefined();
    expect(errorResult.error.message).toContain("environment parameter is required");
  });

  it("has the correct name and schema", () => {
    const tool = createListMarkersTool(api);
    expect(tool.name).toBe("list_markers");
    expect(tool.schema).toBeDefined();
    expect(tool.schema.environment).toBeDefined();
  });
});