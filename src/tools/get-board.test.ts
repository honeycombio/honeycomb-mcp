import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGetBoardTool } from "./get-board.js";
import { HoneycombAPI } from "../api/client.js";

// Mock the API client
vi.mock("../api/client.js", () => {
  return {
    HoneycombAPI: vi.fn().mockImplementation(() => ({
      getBoard: vi.fn(),
    })),
  };
});

describe("get-board tool", () => {
  let api: HoneycombAPI;

  beforeEach(() => {
    api = new HoneycombAPI({} as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns board details", async () => {
    const mockBoard = {
      id: "board-1",
      name: "Production Overview",
      description: "Overview of production metrics",
      column_layout: "multi" as const,
      queries: [
        {
          caption: "Error rate",
          query_style: "graph" as const,
          dataset: "production",
          query_id: "query-1"
        }
      ],
      created_at: "2023-01-01T00:00:00Z",
      updated_at: "2023-01-02T00:00:00Z",
    };

    vi.mocked(api.getBoard).mockResolvedValue(mockBoard);

    const tool = createGetBoardTool(api);
    const result = await tool.handler({ 
      environment: "test-env", 
      boardId: "board-1" 
    });

    expect(api.getBoard).toHaveBeenCalledWith("test-env", "board-1");
    
    // Type assertion to tell TypeScript this is a success result with metadata
    const successResult = result as { 
      content: { type: string; text: string }[]; 
      metadata: { environment: string; boardId: string; name: string } 
    };
    
    expect(successResult.content).toHaveLength(1);
    // Add a check that text property exists before attempting to parse it
    expect(successResult.content[0]?.text).toBeDefined();
    const content = JSON.parse(successResult.content[0]?.text || '{}');
    expect(content.id).toBe("board-1");
    expect(content.name).toBe("Production Overview");
    expect(content.queries).toHaveLength(1);
    expect(successResult.metadata.boardId).toBe("board-1");
    expect(successResult.metadata.name).toBe("Production Overview");
  });

  it("handles API errors", async () => {
    const mockError = new Error("API error");
    vi.mocked(api.getBoard).mockRejectedValue(mockError);
    
    // Mock console.error to prevent error messages during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const tool = createGetBoardTool(api);
    const result = await tool.handler({ 
      environment: "test-env", 
      boardId: "board-1"
    });
    
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
    
    const tool = createGetBoardTool(api);
    const result = await tool.handler({ 
      environment: "", 
      boardId: "board-1" 
    });
    
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

  it("requires the boardId parameter", async () => {
    // Mock console.error to prevent error messages during tests
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const tool = createGetBoardTool(api);
    const result = await tool.handler({ 
      environment: "test-env", 
      boardId: "" 
    });
    
    // Restore console.error
    consoleErrorSpy.mockRestore();

    // Type assertion to tell TypeScript this is an error result
    const errorResult = result as { 
      content: { type: string; text: string }[]; 
      error: { message: string } 
    };

    expect(errorResult.error).toBeDefined();
    expect(errorResult.error.message).toContain("boardId parameter is required");
  });

  it("has the correct name and schema", () => {
    const tool = createGetBoardTool(api);
    expect(tool.name).toBe("get_board");
    expect(tool.schema).toBeDefined();
    expect(tool.schema.environment).toBeDefined();
    expect(tool.schema.boardId).toBeDefined();
  });
});