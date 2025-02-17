import fs from "fs";
import path from "path";
import { StreamingSource } from "../types/stream.types";
import { PuppeteerActions } from "../services/implementations/puppeteer/PuppeteerActions";
import { DockerCommands } from "../services/implementations/docker/DockerCommands";

export const getLatestScreenshot = async (
  source?: StreamingSource,
): Promise<string | null> => {
  try {
    if (source === "chrome-puppeteer") {
      // For Puppeteer, get screenshot from the active page
      try {
        // Since getScreenshot is private, we'll use a dummy action to get a screenshot
        const result = await PuppeteerActions.type("");
        console.log("result ==>", result);
        return result.screenshot;
      } catch (error) {
        console.log("No active Puppeteer session");
        return null;
      }
    } else if (source === "ubuntu-docker-vnc") {
      // For Docker, get screenshot from the active container
      try {
        const containerName = "factif-vnc";
        const containerStatus =
          await DockerCommands.checkContainerStatus(containerName);
        if (
          containerStatus.exists &&
          containerStatus.running &&
          containerStatus.id
        ) {
          const screenshotPath = `/tmp/screenshot_${Date.now()}.png`;
          return await DockerCommands.takeScreenshot(
            containerStatus.id,
            screenshotPath,
          );
        }
      } catch (error) {
        console.log("No active Docker VNC session");
        return null;
      }
    }
    return null;
  } catch (error) {
    console.error("Error getting latest screenshot:", error);
    return null;
  }
};

export const saveScreenshot = async (
  screenshot: string,
  folderPath: string,
  chatId: string,
): Promise<string> => {
  try {
    const screenshotDir = path.join(folderPath, chatId || "", "screenshots");

    // Create the directory if it doesn't exist
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    const fileName = `screenshot_${Date.now()}.jpg`;
    const filePath = path.join(screenshotDir, fileName);
    // Save the screenshot
    fs.writeFileSync(filePath, Buffer.from(screenshot, "base64"));
    console.log(`Screenshot saved: ${filePath}`);

    // Return the relative path of the saved screenshot
    return path.relative(folderPath, filePath);
  } catch (error) {
    console.log(`Screenshot Save Error`, error);
    return "";
  }
};
