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
      /<(?:ask_followup_question|follow_up_question)>[\s\n]*<question>[\s\n]*(.*?)[\s\n]*<\/question>(?:[\s\n]*<additional_info>(.*?)<\/additional_info>)?[\s\n]*<\/(?:ask_followup_question|follow_up_question)>/s,
    completeTask:
      /<complete_task>[\s\n]*<task_status>([\s\S]*?)<\/task_status>[\s\n]*<additional_info>([\s\S]*?)<\/additional_info>[\s\n]*<\/complete_task>/s,
    performAction:
      /<perform_action>[\s\S]*?<action>(.*?)<\/action>(?:[\s\S]*?<url>(.*?)<\/url>)?(?:[\s\S]*?<coordinate>(.*?)<\/coordinate>)?(?:[\s\S]*?<text>(.*?)<\/text>)?(?:[\s\S]*?<key>(.*?)<\/key>)?(?:[\s\S]*?<about_this_action>(.*?)<\/about_this_action>)?(?:[\s\S]*?<marker_number>(.*?)<\/marker_number>)?[\s\S]*?<\/perform_action>/s,
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
        open: "<follow_up_question>",
        close: "</follow_up_question>",
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
    const actionMatch = fullMatch.match(this.patterns.performAction);
    let match = null;
    if (actionMatch) {
      match = {
        length: fullMatch.length,
        part: {
          type: "perform_action",
          action: actionMatch[1],
          ...(actionMatch[2] && { url: actionMatch[2] }),
          ...(actionMatch[3] && { coordinate: actionMatch[3] }),
          ...(actionMatch[4] && { text: actionMatch[4] }),
          ...(actionMatch[5] && { key: actionMatch[5] }),
        } as PerformAction,
      };
    }
    return match;
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
    const matchObj = fullMatch.match(this.patterns.completeTask);
    if (!matchObj || !matchObj[1] || !matchObj[2]) return null;
    
    const taskStatus = matchObj[1];
    const additionalInfo = matchObj[2];
    
    // Add checkmark emoji for successful tasks
    const formattedResult = `${taskStatus === "success" ? "✅ " : ""}${additionalInfo}`;
    
    return {
      length: fullMatch.length,
      part: {
        type: "complete_task",
        result: formattedResult,
      } as CompleteTask,
    };
  }

  private static processFollowupQuestion(
    fullMatch: string,
  ): IProcessedMessagePart | null {
    const matches = fullMatch.match(this.patterns.followupQuestion);
    let match = null;
    if (matches && matches[1]) {
      const question = matches[1];
      const additionalInfo = matches[2] || null;
      match = {
        length: fullMatch.length,
        part: { 
          type: "followup_question", 
          question,
          ...(additionalInfo && { additionalInfo })
        } as FollowupQuestion,
      };
    }
    return match;
  }

  static extractAction(text: string): PerformAction | null {
    const match = text.match(this.patterns.performAction);
    if (!match) return null;

    return {
      type: "perform_action",
      action: match[1],
      ...(match[2] && { url: match[2] }),
      ...(match[3] && { coordinate: match[3] }),
      ...(match[4] && { text: match[4] }),
      ...(match[5] && { key: match[5] }),
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
