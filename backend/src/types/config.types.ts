type ContextConfig = {
  minMessages: number;
  contextReservePercentage: number;
  modelContextWindows: Record<string, number>;
};

type LLMProviderConfig = {
  apiKey?: string;
  model: string;
  contextConfig: ContextConfig;
};

type OpenAIConfig = LLMProviderConfig & {
  azure: {
    endpoint?: string;
    apiKey?: string;
    model: string;
    version: string;
  };
};

type AnthropicConfig = LLMProviderConfig & {
  useBedrock: boolean;
  bedrock: {
    region: string;
    credentials: {
      accessKeyId?: string;
      secretAccessKey?: string;
      sessionToken?: string;
    };
    modelId: string;
  };
};

type GeminiConfig = LLMProviderConfig & {
  visionModel: string;
};

export type LLMConfig = {
  provider: "anthropic" | "openai" | "azure-openai" | "gemini";
  openai: OpenAIConfig;
  anthropic: AnthropicConfig;
  gemini: GeminiConfig;
};

export type Config = {
  port: number | string;
  env: string;
  explorer: {
    enabled: boolean;
    allowedPaths: string[];
    maxDepth: number;
    maxFilesPerDirectory: number;
    excludedFolders: string[];
  };
  llm: LLMConfig;
  streamConfig: {
    keepAliveInterval: number;
  };
  omniParser: {
    enabled: boolean;
    serverUrl: string;
  };
  retryAttemptCount: number;
  retryTimeout: number;
};
