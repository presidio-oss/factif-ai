import path from "path";
import fs from "fs";
import { OmniParserResult } from "../types/action.types";
import { StreamingSource } from "../types/stream.types";
import { PuppeteerActions } from "../services/implementations/puppeteer/PuppeteerActions";
import { DockerCommands } from "../services/implementations/docker/DockerCommands";
import { DockerActions } from "../services/implementations/docker/DockerActions";

/**
 * Logs the provided message request to a JSON file in the logs directory.
 *
 * @param {any} messageRequest - The message request object to be logged. It will be converted to a JSON string format and stored in the log file.
 * @return {void} This function does not return a value.
 */
export function logMessageRequest(messageRequest: any): void {
  try {
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, "../../../logs");
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Create a log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = path.join(logsDir, `message-request-${timestamp}.json`);

    fs.writeFileSync(logFile, JSON.stringify(messageRequest, null, 2));
  } catch (error) {
    console.error("Error logging message request:", error);
  }
}

/**
 * Updates the last message in the messages array with the Omni Parser results
 * if the role of the last message matches the provided user role.
 *
 * @param {any[]} messages - The array of message objects to be updated.
 * @param {OmniParserResult} omniParserResult - The result object from the Omni Parser, containing label coordinates and parsed content.
 * @param {string} userRole - The role of the user to check against the last message's role.
 * @return {void} No return value. The messages array is modified in place.
 */
export function addOmniParserResults(
  messages: any[],
  omniParserResult: OmniParserResult,
  userRole: string,
): void {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === userRole) {
    const content = Array.isArray(lastMessage.content)
      ? lastMessage.content[0].text
      : lastMessage.content;
    const updatedContent = `${content}\n\nOmni Parser Results:\n${JSON.stringify(
      {
        label_coordinates: omniParserResult.label_coordinates,
        parsed_content: omniParserResult.parsed_content,
      },
      null,
      2,
    )}`;
    if (Array.isArray(lastMessage.content)) {
      lastMessage.content[0].text = updatedContent;
    } else {
      lastMessage.content = updatedContent;
    }
  }
}

export async function getCurrentUrlBasedOnSource(source: StreamingSource) {
  let pageUrl = "";
  console.log("coming here");
  if (source === "chrome-puppeteer") {
    pageUrl = await PuppeteerActions.getCurrentUrl();
  } else if (source === "ubuntu-docker-vnc") {
    try {
      const containerName = "factif-vnc";
      const containerStatus =
        await DockerCommands.checkContainerStatus(containerName);
      console.log("containerStatus", containerStatus);
      if (
        containerStatus.exists &&
        containerStatus.running &&
        containerStatus.id
      ) {
        pageUrl = await DockerActions.getUrl(containerStatus.id);
        console.log("pageUrl", pageUrl);
      }
    } catch (error) {
      console.log("No active Docker VNC session");
    }
  }
  return pageUrl;
}
