import {
  ActionResult,
  ChatMessage,
  OmniParserResult,
} from "../types/chat.types";
import { Action, StreamingSource } from "../types/api.types";
import { MessageProcessor } from "./messageProcessor";

const API_BASE_URL = "/api";

export const checkHealth = async () => {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
};

export const sendChatMessage = async (
  message: string,
  imageData: string | undefined,
  history: ChatMessage[],
  folderPath: string,
  currentChatId: string,
  source: "chrome-puppeteer" | "ubuntu-docker-vnc",
  onChunk: (chunk: string) => void,
  onComplete: (cost: number) => void,
  onError: (error: Error) => void,
  omniParserResult?: OmniParserResult | null,
  saveScreenshots: boolean = false,
): Promise<() => void> => {
  let hasReceivedMessage = false;

  // Create a URLSearchParams object for the query parameters
  const queryParams = new URLSearchParams({
    folderPath,
    currentChatId,
    source,
    saveScreenshots: saveScreenshots.toString(),
    mode: "regression", // Explicitly set normal chat mode
  });

  // Create the EventSource with POST method using a fetch API
  const response = await fetch(`${API_BASE_URL}/chat?${queryParams}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: MessageProcessor.parseActionResult(message),
      imageData,
      // Sanitize history before sending to backend
      history: history.map((msg) => {
        if (msg.isUser) {
          return { text: msg.text, isUser: true };
        }

        // If this is an action result, convert it to plain text feedback
        if (msg.text.includes("<perform_action_result>")) {
          const text = MessageProcessor.parseActionResult(msg.text);
          if (text) {
            return {
              text,
              isUser: true, // Mark as user message for LLM context
            };
          }
        }

        return { text: msg.text, isUser: false };
      }),
      omniParserResult: omniParserResult || undefined,
    }),
  });

  if (!response.body) {
    throw new Error("No response body received");
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  const decoder = new TextDecoder();
  let connectionTimeout: ReturnType<typeof setTimeout> | undefined = undefined;


  try {
    reader = response.body.getReader();

    // Set up connection timeout
    connectionTimeout = setTimeout(() => {
      if (!hasReceivedMessage) {
        console.error("Connection timeout");
        reader?.cancel();
        onError(new Error("Connection timeout - no response received"));
      }
    }, 60 * 1000); // 60 second timeout
    // Process the stream
    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            onComplete(-1);
            break;
          }

          hasReceivedMessage = true;
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }

          // Use decodeWithStream option to handle potential partial UTF-8 characters
          const chunk = decoder.decode(value, {stream: true});
          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                // Try to parse the JSON data
                const data = JSON.parse(line.slice(6));
                if (data.isComplete) {
                  onComplete(data.totalCost);
                  return;
                } else if (data.isError) {
                  onError(new Error(data.message));
                  return;
                } else if (data.message) {
                  onChunk(data.message);
                }
              } catch (jsonError) {
                // Log error but don't break the stream
                console.warn("JSON parse error in stream chunk:", jsonError);
                // If this is a syntax error, it might be a partial chunk
                // Just continue and wait for the next chunk
              }
            }
          }
        }
      } catch (error) {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        console.error("Stream processing error:", error);
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    processStream();
  } catch (error) {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  const cleanup = () => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    reader?.cancel();
  };

  return cleanup;
};

export const getFileStructure = async (path: string) => {
  const response = await fetch(
    `${API_BASE_URL}/filesystem/structure?path=${encodeURIComponent(path)}`,
  );
  return response.json();
};

export const executeAction = async (
  action: Action,
  source: StreamingSource,
  config: Record<string, string>
): Promise<ActionResult> => {
  const response = await fetch(
    `${API_BASE_URL}/actions/execute?source=${source}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-factifai-config": btoa(JSON.stringify(config))
      },
      body: JSON.stringify(action),
    },
  );

  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      result.error || `Action execution failed: ${response.statusText}`,
    );
  }
  return result;
};

export const sendExploreChatMessage = async (
  message: string,
  imageData: string | undefined,
  history: ChatMessage[],
  type: string,
  folderPath: string,
  currentChatId: string,
  source: "chrome-puppeteer" | "ubuntu-docker-vnc",
  onChunk: (chunk: string) => void,
  onComplete: (image?: string, cost?: number) => void,
  onError: (error: Error) => void,
  omniParserResult?: OmniParserResult | null,
  saveScreenshots: boolean = false,
): Promise<() => void> => {
  let hasReceivedMessage = false;

  // Create a URLSearchParams object for the query parameters
  const queryParams = new URLSearchParams({
    folderPath,
    currentChatId,
    source,
    type,
    saveScreenshots: saveScreenshots.toString(),
    mode: "explore", // Explicitly set explore mode
  });

  // Create the EventSource with POST method using a fetch API
  const response = await fetch(
    `${API_BASE_URL}/explore/message?${queryParams}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: MessageProcessor.parseActionResult(message),
        imageData,
        // Sanitize history before sending to backend
        history: history.map((msg) => {
          if (msg.isUser) {
            return { text: msg.text, isUser: true };
          }

          // If this is an action result, convert it to plain text feedback
          if (msg.text.includes("<perform_action_result>")) {
            const text = MessageProcessor.parseActionResult(msg.text);
            if (text) {
              return {
                text,
                isUser: true, // Mark as user message for LLM context
              };
            }
          }

          return { text: msg.text, isUser: false };
        }),
        omniParserResult: omniParserResult || undefined,
      }),
    },
  );

  if (!response.body) {
    throw new Error("No response body received");
  }

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  const decoder = new TextDecoder();
  let connectionTimeout: ReturnType<typeof setTimeout> | undefined = undefined;


  try {
    reader = response.body.getReader();

    // Set up connection timeout
    connectionTimeout = setTimeout(() => {
      if (!hasReceivedMessage) {
        console.error("Connection timeout");
        reader?.cancel();
        onError(new Error("Connection timeout - no response received"));
      }
    }, 60 * 1000); // 60 second timeout
    // Process the stream
    const processStream = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            onComplete(imageData);
            break;
          }

          hasReceivedMessage = true;
          if (connectionTimeout) {
            clearTimeout(connectionTimeout);
          }

          // Use decodeWithStream option to handle potential partial UTF-8 characters
          const chunk = decoder.decode(value, {stream: true});

          const lines = chunk.split("\n").filter((line) => line.trim());

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.isComplete) {
                  onComplete(data?.imageData, data?.totalCost);
                  return;
                } else if (data.isError) {
                  onError(new Error(data.message));
                  return;
                } else if (data.message) {
                  onChunk(data.message);
                }
              } catch (e) {
                // Log the error but continue processing
                console.warn("JSON parse error in explore stream chunk:", e);
                // Continue to the next chunk
              }
            }
          }
        }
      } catch (error) {
        if (connectionTimeout) {
          clearTimeout(connectionTimeout);
        }
        console.error("Stream processing error:", error);
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    };

    processStream();
  } catch (error) {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    throw error instanceof Error ? error : new Error(String(error));
  }

  const cleanup = () => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    reader?.cancel();
  };

  return cleanup;
};

export const getCurrentUrl = async (
  source: StreamingSource,
): Promise<string | null> => {
  try {
    const response = await fetch(
      `${API_BASE_URL}/explore/current-path?source=${source}`,
    );
    const data: { url: string } = await response.json();
    return data.url;
  } catch (e) {
    return null;
  }
};

// History API methods
export const getSessionsList = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/history/sessions`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching sessions list:', error);
    throw error;
  }
};

export const getSession = async (sessionId: string) => {
  // First validate the session ID
  if (!sessionId || typeof sessionId !== 'string') {
    console.warn("Attempted to fetch session with invalid sessionId");
    return null;
  }
  
  const trimmedId = sessionId.trim();
  if (trimmedId === '') {
    console.warn("Attempted to fetch session with empty sessionId");
    return null;
  }

  try {
    // Don't strip special characters as they may be part of valid IDs
    const cleanId = trimmedId.replace(/\/$/, "");
    console.log(`Making API request for session: ${cleanId}`);
    
    // Double check that we have a valid ID after cleaning
    if (!cleanId) {
      console.warn("Session ID was invalid after cleaning");
      return null;
    }

    // Ensure proper URL encoding for IDs with special characters like #
    const encodedId = encodeURIComponent(cleanId);
    console.log(`Encoded session ID for request: ${encodedId}`);
    
    const requestUrl = `${API_BASE_URL}/history/session/${encodedId}`;
    console.log(`Full request URL: ${requestUrl}`);
    
    const response = await fetch(requestUrl);
    if (response.status === 404) {
      // Quietly handle missing sessions without error logging
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch session: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`Error fetching session ${sessionId}:`, error);
    return null; // Always return null on error instead of throwing
  }
};

export const saveSession = async (session: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/history/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(session),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save session: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving session:', error);
    throw error;
  }
};

export const deleteSession = async (sessionId: string) => {
  try {
    // Make sure sessionId is valid before making the request
    if (!sessionId || sessionId === "") {
      console.warn("Attempted to delete session with empty sessionId");
      return { success: true }; // Return success since there's nothing to delete
    }
    
    // Remove trailing slashes if present
    const cleanId = sessionId.replace(/\/$/, "");
    
    const response = await fetch(`${API_BASE_URL}/history/session/${cleanId}`, {
      method: 'DELETE',
    });
    
    if (response.status === 404) {
      // Quietly handle missing sessions without error logging
      return { success: true };
    }
    
    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error deleting session ${sessionId}:`, error);
    throw error;
  }
};

export const migrateFromLocalStorage = async (migrationData: any) => {
  try {
    const response = await fetch(`${API_BASE_URL}/history/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(migrationData),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to migrate data: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error migrating data:', error);
    throw error;
  }
};
