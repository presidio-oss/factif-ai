import { executeAction } from "./api";
import { MessagePatterns } from "../utils/messagePatterns";
import { StreamingSource } from "../types/api.types";
import { OmniParserResult } from "@/types/chat.types";
import { ExploreOutput } from "@/types/message.types.ts";

interface ProcessedMessage {
  text: string;
  actionResult?: string;
  omniParserResult?: OmniParserResult;
}

export class MessageProcessor {
  private static setHasActiveAction: ((value: boolean) => void) | null = null;

  static initialize(setHasActiveAction: (value: boolean) => void) {
    MessageProcessor.setHasActiveAction = setHasActiveAction;
  }

  static parseActionResult(text: string): string {
    const match = text.match(
      /<perform_action_result>[\s\S]*?<action_message>(.*?)<\/action_message>[\s\S]*?<\/perform_action_result>/,
    );
    return match ? match[1] : text;
  }

  static async processMessage(
    chunk: string,
    source: StreamingSource,
  ): Promise<ProcessedMessage> {
    // Extract any perform_action from the chunk
    const action = MessagePatterns.extractAction(chunk);

    if (action) {
      try {
        // If action is not "launch" but we detect a URL in the message,
        // we should launch the browser first
        if (action.action !== "launch" && 
            (chunk.includes("http://") || chunk.includes("https://") || 
             /\b[a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)\b/i.test(chunk))) {
          
          // Extract URL from the message
          let urlMatch = chunk.match(/(https?:\/\/[^\s'"]+)/i);
          
          // If no http/https URL, try to detect domain names like example.com
          // Use negative lookbehind (?<!@) to avoid matching domains in email addresses
          if (!urlMatch) {
            urlMatch = chunk.match(/(?<!@)\b([a-z0-9-]+\.(com|org|net|io|dev|edu|gov|co|app)[^\s'"]*)\b/i);
            if (urlMatch) {
              // Prepend https:// to the domain
              urlMatch[1] = `https://${urlMatch[1]}`;
            }
          }
          
          // Skip auto-launching if we're in a type action for an email field
          if (action.action === "type" && 
              (action.text?.includes("@") || 
               /email|mail|e-mail/i.test(chunk))) {
            urlMatch = null;
          }
          if (urlMatch && urlMatch[1]) {
            console.log("Auto-launching browser with URL:", urlMatch[1]);
            
            // Create a launch action and execute it first
            const launchAction = {
              type: "perform_action",
              action: "launch",
              url: urlMatch[1],
            };
            
            try {
              MessageProcessor.setHasActiveAction?.(true);
              await executeAction(launchAction, source);
              console.log("Browser launched automatically");
            } catch (error) {
              console.error("Failed to auto-launch browser:", error);
              // Continue with original action even if auto-launch failed
            }
          }
        }
        
        MessageProcessor.setHasActiveAction?.(true);
        const response = await executeAction(action, source);
        MessageProcessor.setHasActiveAction?.(false);
        const actionMessage =
          response.message || response.error || "Action completed";

        // Format action result with XML tags
        const actionResult = `<perform_action_result>
<action_status>${response.status === "success" ? "success" : "error"}</action_status>
<action_message>${actionMessage}</action_message>
${response.screenshot ? `<screenshot>${response.screenshot}</screenshot>` : ""}
${response.omniParserResult ? `<omni_parser>${JSON.stringify(response.omniParserResult)}</omni_parser>` : ""}
</perform_action_result>`;

        // Extract omni parser result if present
        const omniParserMatch = actionResult.match(
          /<omni_parser>(.*?)<\/omni_parser>/s,
        );
        const omniParserResult = omniParserMatch
          ? JSON.parse(omniParserMatch[1])
          : undefined;

        // Return original message with action result and omni parser data
        return { text: chunk, actionResult, omniParserResult };
      } catch (error) {
        MessageProcessor.setHasActiveAction?.(false);
        console.error("Failed to perform browser action:", error);
        const errorMessage =
          error instanceof Error ? error.message : "Failed to perform action";

        // Format error result with XML tags
        const actionResult = `<perform_action_result>
<action_status>error</action_status>
<action_message>${errorMessage}</action_message>
</perform_action_result>`;

        // Return original message with just the action
        return { text: chunk, actionResult };
      }
    }

    // Return just the text if no action was performed
    return { text: chunk };
  }

  static processExploreMessage(chunk: string) {
    return (MessagePatterns.processExploreOutput(chunk).part as ExploreOutput)
      ?.clickableElements;
  }
}
