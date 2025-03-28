import fs from "fs";
import path from "path";
import { StreamingSource } from "../types/stream.types";
import { PuppeteerActions } from "../services/implementations/puppeteer/PuppeteerActions";
import { PuppeteerService } from "../services/implementations/puppeteer/PuppeteerService";
import { DockerCommands } from "../services/implementations/docker/DockerCommands";
import { IProcessedScreenshot } from "../services/interfaces/BrowserService";

export const getLatestScreenshot = async (
  source?: StreamingSource
): Promise<IProcessedScreenshot> => {
  let screenshot: IProcessedScreenshot = {
    image: "",
    inference: [],
    totalScroll: -1,
    scrollPosition: -1,
    originalImage: "",
  };
  try {
    if (source === "chrome-puppeteer") {
      // For Puppeteer, get screenshot from the active page
      try {
        // First check if browser is running before attempting to capture screenshot
        // Use static properties directly since this is a singleton pattern
        if (PuppeteerService.browser && PuppeteerService.page) {
          // Browser is running, safe to capture screenshot
          screenshot = await PuppeteerActions.captureScreenshot();
        } else {
          console.log("Browser is not launched yet. Skipping screenshot capture.");
        }
      } catch (error) {
        console.log("No active Puppeteer session", error);
      }
    } else if (source === "ubuntu-docker-vnc") {
      // For Docker, get screenshot from the active container
      try {
        const containerName = "factif-vnc";
        const containerStatus = await DockerCommands.checkContainerStatus(
          containerName
        );
        if (
          containerStatus.exists &&
          containerStatus.running &&
          containerStatus.id
        ) {
          const screenshotPath = `/tmp/screenshot_${Date.now()}.png`;
          const currentScreenshot = await DockerCommands.takeScreenshot(
            containerStatus.id,
            screenshotPath
          );
          screenshot.image = currentScreenshot;
          screenshot.originalImage = currentScreenshot;
        }
      } catch (error) {
        console.log("No active Docker VNC session", error);
      }
    }
  } catch (error) {
    console.error("Error getting latest screenshot:", error);
  }
  return screenshot;
};

export const saveScreenshot = async (
  screenshot: IProcessedScreenshot,
  folderPath: string,
  chatId: string
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
    fs.writeFileSync(filePath, Buffer.from(screenshot.image, "base64"));
    console.log(`Screenshot saved: ${filePath}`);

    // Return the relative path of the saved screenshot
    return path.relative(folderPath, filePath);
  } catch (error) {
    console.log(`Screenshot Save Error`, error);
    return "";
  }
};
