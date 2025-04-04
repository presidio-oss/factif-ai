import { Config } from "../types/config.types";

// WARNING - Don't enable explorer in a hosted server environment. This is meant for local frontend and backend deployments only.
export const config: Config = {
  port: process.env.PORT || 3001,
  env: "development",
  explorer: {
    enabled: true, // Enable/disable all filesystem functionality
    allowedPaths: ["/Users/"], // List of paths that are allowed to be accessed
    maxDepth: 10, // Maximum directory depth that can be traversed
    maxFilesPerDirectory: 1000, // Maximum number of files to return per directory
    excludedFolders: [".git", "node_modules", ".DS_Store"], // Folders to exclude from listing
  },
  llm: {
    provider: (process.env.LLM_PROVIDER || "gemini") as
      | "anthropic"
      | "openai"
      | "azure-openai"
      | "gemini",
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || "gpt-4o",
      contextConfig: {
        minMessages: 10,
        contextReservePercentage: 20,
        modelContextWindows: {
          "gpt-4-turbo-preview": 128000,
          "gpt-4": 8000,
          "gpt-3.5-turbo": 16000,
        },
      },
      azure: {
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        model: process.env.AZURE_OPENAI_MODEL || "gpt-4o",
        version: process.env.AZURE_OPENAI_VERSION || "2024-08-01-preview",
      },
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      contextConfig: {
        minMessages: 10,
        contextReservePercentage: 20,
        modelContextWindows: {
          "anthropic.claude-3-5-sonnet-20241022-v2:0": 200000,
        },
      },
      useBedrock: process.env.USE_BEDROCK === "true",
      bedrock: {
        region: process.env.AWS_REGION || "us-west-2",
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        modelId:
          process.env.BEDROCK_MODEL_ID ||
          "anthropic.claude-3-5-sonnet-20241022-v2:0",
      },
    },
    // In config/index.ts
    gemini: {
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || "gemini-pro",
        visionModel: process.env.GEMINI_VISION_MODEL || "gemini-1.5-flash", // Change from gemini-pro-vision to gemini-1.5-flash
        contextConfig: {
            minMessages: 10,
            contextReservePercentage: 20,
            modelContextWindows: {
                "gemini-pro": 32000,
                "gemini-1.5-flash": 32000, // Add this line
            },
        },
    },
    
  },
  streamConfig: {
    keepAliveInterval: 60_000, // 60 seconds
  },
  omniParser: {
    enabled: process.env.ENABLE_OMNI_PARSER === "true",
    serverUrl: process.env.OMNI_PARSER_URL || "http://localhost:7862",
  },
  retryAttemptCount: parseInt(process.env.RETRY_ATTEMPT_COUNT as string) || 5,
  retryTimeout: parseInt(process.env.RETRY_TIMEOUT as string) || 5_000,
};
