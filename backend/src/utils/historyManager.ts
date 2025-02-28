import { ChatMessage } from "../types/chat.types";
import { config } from "../config";
import { LLMConfig } from "../types/config.types";

// Rough estimation of tokens based on characters (this is a simple approximation)
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4); // Rough approximation: 1 token ≈ 4 characters
};

export const getContextWindow = (
  provider: LLMConfig["provider"],
  model: string,
): number => {
  // Use OpenAI config for azure-openai since they share the same models
  const providerConfig =
    config.llm[provider === "azure-openai" ? "openai" : provider];
  if (!providerConfig?.contextConfig?.modelContextWindows) {
    return 8000; // Default fallback
  }
  return providerConfig.contextConfig.modelContextWindows[model] || 8000;
};

export const trimHistory = (
  history: ChatMessage[],
  provider: LLMConfig["provider"],
  model: string,
): ChatMessage[] => {
  if (history.length === 0) return [];

  // Use OpenAI config for azure-openai
  const contextConfig =
    config.llm[provider === "azure-openai" ? "openai" : provider]
      ?.contextConfig;
  if (!contextConfig) return history;

  const contextWindow = getContextWindow(provider, model);
  // Reserve 30% for system prompt, new message, and image (images can take significant context)
  const reserveTokens = Math.floor(contextWindow * 0.3);
  const maxTokens = contextWindow - reserveTokens;

  // Always keep the first message as it contains user context
  let result = history.length > 0 ? [history[0]] : [];
  let currentTokens = result.length > 0 ? estimateTokens(result[0].text) : 0;

  // Process remaining messages in chronological order
  const remainingMessages = history.slice(1);

  // First pass: count tokens and identify messages to keep
  const messagesToKeep = [];
  for (const message of remainingMessages) {
    const messageTokens = estimateTokens(message.text);
    const hasActionResult =
      !message.isUser && message.text.includes("<perform_action_result>");

    // Keep message if:
    // 1. We have space within maxTokens
    // 2. OR it's an action result and we can stretch 10%
    // 3. OR we haven't hit minimum messages
    if (
      currentTokens + messageTokens <= maxTokens ||
      (hasActionResult && currentTokens + messageTokens <= maxTokens * 1.1) ||
      result.length + messagesToKeep.length < contextConfig.minMessages
    ) {
      messagesToKeep.push(message);
      currentTokens += messageTokens;
    }
  }

  // Add kept messages to result in original order
  result = [...result, ...messagesToKeep];

  return result;
};

export const getCoordinate = (coordinate: string) => {
  const [x, y]: number[] = coordinate?.split(",").map((v) => parseInt(v));
  return { x, y };
};
