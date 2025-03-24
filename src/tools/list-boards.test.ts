import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createListBoardsTool } from "./list-boards.js";
import { HoneycombAPI } from "../api/client.js";

// Mock the API client
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => ({
      getBoards: vi.fn(),
    })),
  };
});

describe("list-boards tool", () => {
  let api: HoneycombAPI;

  beforeEach(() => {
    api = new HoneycombAPI({} as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a list of boards", async () => {
    const mockBoards = [
      {
        id: "board-1",
        name: "Production Overview",
        description: "Overview of production metrics",
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-02T00:00:00Z",
      },
      {
        id: "board-2",
        name: "Error Tracking",
        description: "Monitors application errors",
        created_at: "2023-01-03T00:00:00Z",
        updated_at: "2023-01-04T00:00:00Z",
      },
    ];

    vi.mocked(api.getBoards).mockResolvedValue(mockBoards);

    const tool = createListBoardsTool(api);
    const result = await tool.handler({ environment: "test-env" });

    expect(api.getBoards).toHaveBeenCalledWith("test-env");
    
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
    expect(content[0].id).toBe("board-1");
    expect(content[1].name).toBe("Error Tracking");
    expect(successResult.metadata.count).toBe(2);
  });

  it("handles API errors", async () => {
    const mockError = new Error("API error");
    vi.mocked(api.getBoards).mockRejectedValue(mockError);
    
    // Mock console.error to prevent error messages during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const tool = createListBoardsTool(api);
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
    
    const tool = createListBoardsTool(api);
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

  it("handles undefined boards response", async () => {
    // Mock console.warn to prevent warning messages during tests
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Mock getBoards to return undefined
    vi.mocked(api.getBoards).mockResolvedValue(undefined as any);

    const tool = createListBoardsTool(api);
    const result = await tool.handler({ environment: "test-env" });
    
    // Restore console.warn
    consoleWarnSpy.mockRestore();
    
    // Type assertion to tell TypeScript this is a success result with metadata
    const successResult = result as { 
      content: { type: string; text: string }[]; 
      metadata: { count: number; environment: string } 
    };
    
    expect(successResult.content).toHaveLength(1);
    // Add a check that text property exists before attempting to parse it
    expect(successResult.content[0]?.text).toBeDefined();
    const content = JSON.parse(successResult.content[0]?.text || '[]');
    expect(content).toHaveLength(0);
    expect(successResult.metadata.count).toBe(0);
  });

  it("has the correct name and schema", () => {
    const tool = createListBoardsTool(api);
    expect(tool.name).toBe("list_boards");
    expect(tool.schema).toBeDefined();
    expect(tool.schema.environment).toBeDefined();
  });
});