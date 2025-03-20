import {
  ActionResult,
  CompleteTask,
  FollowupQuestion,
  IProcessedMessagePart,
  MessagePart,
  PerformAction,
} from "@/types/message.types.ts";

export class MessagePatterns {
  private static patterns = {
    followupQuestion:
      /<ask_followup_question>[\s\n]*<question>[\s\n]*(.*?)[\s\n]*<\/question>[\s\n]*<\/ask_followup_question>/s,
    completeTask:
      /<complete_task>[\s\n]*<result>([\s\S]*?)<\/result>(?:[\s\n]*<command>(.*?)<\/command>)?[\s\n]*<\/complete_task>/s,
    // Individual patterns for each tag in perform_action - ensures all characters are properly preserved
    performActionTags: {
      action: /<action>([\s\S]*?)<\/action>/s,
      url: /<url>([\s\S]*?)<\/url>/s,
      coordinate: /<coordinate>([\s\S]*?)<\/coordinate>/s,
      text: /<text>([\s\S]*?)<\/text>/s,
      key: /<key>([\s\S]*?)<\/key>/s,
      aboutThisAction: /<about_this_action>([\s\S]*?)<\/about_this_action>/s,
      markerNumber: /<marker_number>([\s\S]*?)<\/marker_number>/s,
    },
    // Main pattern just to identify a perform_action block
    performAction: /<perform_action>[\s\S]*?<\/perform_action>/s,
    actionResult:
      /<perform_action_result>[\s\S]*?<action_status>(success|error)<\/action_status>[\s\S]*?<action_message>(.*?)<\/action_message>(?:[\s\S]*?<screenshot>(.*?)<\/screenshot>)?(?:[\s\S]*?<omni_parser>(.*?)<\/omni_parser>)?[\s\S]*?<\/perform_action_result>/s,
    exploreOutput:
      /<explore_output>[\s\n]* <clickable_element>[\s\n](?:<text>[\s\S]*?<\/text>)?(?:[\s\n]*<coordinates>[\s\S]*?<\/coordinates>)?(?:[\s\n]*<about_this_element>[\s\S]*?<\/about_this_element>)?[\s\n]*<\/clickable_element>[\s\n]*<\/explore_output>/s,
  };

  static parseMessage(text: string): MessagePart[] {
    const parts: MessagePart[] = [];

    // Define all possible tag pairs with their closing tags
    const tagPairs = [
      {
        open: "<ask_followup_question>",
        close: "</ask_followup_question>",
        processor: this.processFollowupQuestion.bind(this),
      },
      {
        open: "<complete_task>",
        close: "</complete_task>",
        processor: this.processCompleteTaskMatch.bind(this),
      },
      {
        open: "<perform_action>",
        close: "</perform_action>",
        processor: this.performActionMatch.bind(this),
      },
      {
        open: "<perform_action_result>",
        close: "</perform_action_result>",
        processor: this.performActionResultMatch.bind(this),
      },
      {
        open: "<explore_output>",
        close: "</explore_output>",
        processor: this.processExploreOutput.bind(this),
      },
    ];

    let remainingText = text;

    while (remainingText.length > 0) {
      // Find the first occurrence of any opening tag
      const tagStarts = tagPairs
        .map((pair) => ({
          pair,
          index: remainingText.indexOf(pair.open),
        }))
        .filter((t) => t.index !== -1);

      if (tagStarts.length === 0) {
        // No more tags found, add remaining text if any
        if (remainingText.trim()) {
          parts.push({
            type: "text",
            content: remainingText.trim(),
          });
        }
        break;
      }

      // Get the earliest tag
      const earliestTag = tagStarts.reduce((min, curr) =>
        curr.index < min.index ? curr : min,
      );

      // Add any text before the tag
      const preText = remainingText.slice(0, earliestTag.index).trim();
      if (preText) {
        parts.push({
          type: "text",
          content: preText,
        });
      }

      // Find the matching closing tag
      const closeIndex = remainingText.indexOf(
        earliestTag.pair.close,
        earliestTag.index + earliestTag.pair.open.length,
      );

      if (closeIndex === -1) {
        // No closing tag found, treat the opening tag as text
        parts.push({
          type: "text",
          content: remainingText.slice(
            earliestTag.index,
            earliestTag.index + earliestTag.pair.open.length,
          ),
        });
        remainingText = remainingText.slice(
          earliestTag.index + earliestTag.pair.open.length,
        );
        continue;
      }

      // Extract the full tag content
      const fullTag = remainingText.slice(
        earliestTag.index,
        closeIndex + earliestTag.pair.close.length,
      );

      // Process the tag
      const processedMatch = earliestTag.pair.processor(fullTag);
      if (processedMatch) {
        parts.push(processedMatch.part);
      }

      // Move past this tag
      remainingText = remainingText.slice(
        closeIndex + earliestTag.pair.close.length,
      );
    }

    return parts;
  }

  private static performActionMatch(
    fullMatch: string,
  ): IProcessedMessagePart | null {
    // Check if we have a valid perform_action block
    if (!fullMatch.match(this.patterns.performAction)) {
      return null;
    }
    
    // Extract each tag independently using the individual patterns
    // and make sure to trim whitespace but preserve internal characters
    const actionMatch = fullMatch.match(this.patterns.performActionTags.action);
    const urlMatch = fullMatch.match(this.patterns.performActionTags.url);
    const coordinateMatch = fullMatch.match(this.patterns.performActionTags.coordinate);
    const textMatch = fullMatch.match(this.patterns.performActionTags.text);
    const keyMatch = fullMatch.match(this.patterns.performActionTags.key);
    const aboutThisActionMatch = fullMatch.match(this.patterns.performActionTags.aboutThisAction);
    const markerNumberMatch = fullMatch.match(this.patterns.performActionTags.markerNumber);
    
    // Process matched values to preserve all characters (especially commas)
    const action = actionMatch?.[1]?.trim();
    const url = urlMatch?.[1]?.trim();
    const coordinate = coordinateMatch?.[1]?.trim();
    const text = textMatch?.[1]?.trim();
    const key = keyMatch?.[1]?.trim();
    const aboutThisAction = aboutThisActionMatch?.[1]?.trim();
    const markerNumber = markerNumberMatch?.[1]?.trim();
    
    // Action is required, return null if it's not present
    if (!action) {
      return null;
    }
    
    return {
      length: fullMatch.length,
      part: {
        type: "perform_action",
        action,
        ...(url && { url }),
        ...(coordinate && { coordinate }),
        ...(text && { text }),
        ...(key && { key }),
        ...(aboutThisAction && { aboutThisAction }),
        ...(markerNumber && { markerNumber }),
      } as PerformAction,
    };
  }

  private static performActionResultMatch(
    fullMatch: string,
  ): IProcessedMessagePart | null {
    const resultMatch = fullMatch.match(this.patterns.actionResult);
    let match = null;
    if (resultMatch) {
      match = {
        length: fullMatch.length,
        part: {
          type: "action_result",
          status: resultMatch[1] as "success" | "error",
          message: resultMatch[2],
          ...(resultMatch[3] && { screenshot: resultMatch[3] }),
          ...(resultMatch[4] && {
            omniParserResult: JSON.parse(resultMatch[4]),
          }),
        } as ActionResult,
      };
    }
    return match;
  }

  private static processCompleteTaskMatch(
    fullMatch: string,
  ): IProcessedMessagePart | null {
    const result = fullMatch.match(this.patterns.completeTask)?.[1];
    const command = fullMatch.match(this.patterns.completeTask)?.[2];
    let match = null;
    if (result) {
      match = {
        length: fullMatch.length,
        part: {
          type: "complete_task",
          result,
          ...(command && { command }),
        } as CompleteTask,
      };
    }
    return match;
  }

  private static processFollowupQuestion(
    fullMatch: string,
  ): IProcessedMessagePart | null {
    const question = fullMatch.match(this.patterns.followupQuestion)?.[1];
    let match = null;
    if (question) {
      match = {
        length: fullMatch.length,
        part: { type: "followup_question", question } as FollowupQuestion,
      };
    }
    return match;
  }

  static extractAction(text: string): PerformAction | null {
    // Check if the text contains a perform_action block
    const fullMatch = text.match(this.patterns.performAction);
    if (!fullMatch) return null;
    
    const fullText = fullMatch[0];
    
    // Extract each tag independently - using same approach as performActionMatch
    const actionMatch = fullText.match(this.patterns.performActionTags.action);
    const urlMatch = fullText.match(this.patterns.performActionTags.url);
    const coordinateMatch = fullText.match(this.patterns.performActionTags.coordinate);
    const textMatch = fullText.match(this.patterns.performActionTags.text);
    const keyMatch = fullText.match(this.patterns.performActionTags.key);
    const aboutThisActionMatch = fullText.match(this.patterns.performActionTags.aboutThisAction);
    const markerNumberMatch = fullText.match(this.patterns.performActionTags.markerNumber);
    
    // Process matched values to preserve all characters
    const action = actionMatch?.[1]?.trim();
    const url = urlMatch?.[1]?.trim();
    const coordinate = coordinateMatch?.[1]?.trim();
    const text_content = textMatch?.[1]?.trim();
    const key = keyMatch?.[1]?.trim();
    const aboutThisAction = aboutThisActionMatch?.[1]?.trim();
    const markerNumber = markerNumberMatch?.[1]?.trim();
    
    // Action is required
    if (!action) return null;
    
    return {
      type: "perform_action",
      action,
      ...(url && { url }),
      ...(coordinate && { coordinate }),
      ...(text_content && { text: text_content }),
      ...(key && { key }),
      ...(aboutThisAction && { aboutThisAction }),
      ...(markerNumber && { markerNumber }),
    };
  }

  static processExploreOutput(inputString: string): IProcessedMessagePart {
    const regex =
      /<clickable_element>[\s\S]*?<text>(.*?)<\/text>[\s\S]*?<coordinates>(.*?)<\/coordinates>[\s\S]*?<about_this_element>(.*?)<\/about_this_element>[\s\S]*?<\/clickable_element>/g;
    const clickableElements = [];
    let match;

    while ((match = regex.exec(inputString)) !== null) {
      clickableElements.push({
        text: match[1].trim(),
        coordinates: match[2].trim(),
        aboutThisElement: match[3].trim(),
      });
    }

    return {
      part: {
        type: "explore_output",
        clickableElements,
      },
      length: inputString.length,
    };
  }
}
