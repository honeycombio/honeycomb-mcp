import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { loadConfig } from "./config.js";
import { AuthResponse } from "./types/api.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe("Config", () => {
  const originalEnv = { ...process.env };
  
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv }; // Reset env vars before each test
    
    // Default mock for fetch to return success with minimal auth response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: "test-id",
        type: "test",
        api_key_access: { query: true },
        team: { name: "Test Team", slug: "test-team" },
        environment: { name: "Test Env", slug: "test-env" }
      } as AuthResponse)
    });
  });
  
  afterEach(() => {
    process.env = originalEnv; // Restore original env vars
  });

  describe("loadConfig", () => {
    it("loads config from HONEYCOMB_API_KEY", async () => {
      process.env.HONEYCOMB_API_KEY = "test-key";
      
      const config = await loadConfig();
      
      expect(config.environments).toHaveLength(1);
      const env = config.environments[0];
      if (env) {
        expect(env.name).toEqual("Test Env"); // Name from auth response
        expect(env.apiKey).toEqual("test-key");
        expect(env.teamSlug).toEqual("test-team");
      }
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.honeycomb.io/1/auth",
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Honeycomb-Team": "test-key"
          })
        })
      );
    });

    it("loads config from multiple HONEYCOMB_ENV_*_API_KEY variables", async () => {
      process.env.HONEYCOMB_ENV_PROD_API_KEY = "prod-key";
      process.env.HONEYCOMB_ENV_STAGING_API_KEY = "staging-key";
      
      // Mock fetch to return different responses for different API keys
      mockFetch
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: "prod-id",
            type: "test",
            api_key_access: { query: true },
            team: { name: "Prod Team", slug: "prod-team" },
            environment: { name: "Production", slug: "prod" }
          } as AuthResponse)
        }))
        .mockImplementationOnce(() => Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            id: "staging-id",
            type: "test",
            api_key_access: { query: true },
            team: { name: "Staging Team", slug: "staging-team" },
            environment: { name: "Staging", slug: "staging" }
          } as AuthResponse)
        }));
      
      const config = await loadConfig();
      
      expect(config.environments).toHaveLength(2);
      expect(config.environments.find(e => e.name === "prod")).toBeDefined();
      expect(config.environments.find(e => e.name === "staging")).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("uses custom API endpoint when specified", async () => {
      process.env.HONEYCOMB_API_KEY = "test-key";
      process.env.HONEYCOMB_API_ENDPOINT = "https://custom.honeycomb.io";
      
      await loadConfig();
      
      expect(mockFetch).toHaveBeenCalledWith(
        "https://custom.honeycomb.io/1/auth",
        expect.any(Object)
      );
    });

    it("handles auth failure gracefully", async () => {
      process.env.HONEYCOMB_API_KEY = "invalid-key";
      
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized"
      });
      
      const config = await loadConfig();
      
      // Should still return a config, but without enhanced auth info
      expect(config.environments).toHaveLength(1);
      const env = config.environments[0];
      if (env) {
        expect(env.apiKey).toEqual("invalid-key");
        expect(env.name).toEqual("default"); // Didn't get updated
        expect(env.teamSlug).toBeUndefined(); // Didn't get populated
      }
    });

    it("throws when no environment variables are set", async () => {
      // Ensure no Honeycomb env vars are set
      Object.keys(process.env).forEach(key => {
        if (key.startsWith("HONEYCOMB_")) {
          delete process.env[key];
        }
      });
      
      await expect(loadConfig()).rejects.toThrow(/No Honeycomb configuration found/);
    });
  });
}); 