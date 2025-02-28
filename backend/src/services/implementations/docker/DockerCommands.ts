import { spawn } from "child_process";
import { DockerCommandOptions, ContainerStatus } from "./DockerTypes";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export class DockerCommands {
  static async executeCommand({
    command,
    successMessage,
    errorMessage,
  }: DockerCommandOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      const docker = spawn("docker", command);
      let output = "";

      docker.stdout.on("data", (data) => {
        output += data.toString();
      });

      docker.stderr.on("data", (data) => {
        const error = data.toString();
        if (errorMessage) {
          console.error(`${errorMessage}: ${error}`);
        }
      });

      docker.on("close", (code) => {
        if (code === 0) {
          if (successMessage) {
            console.log(successMessage);
          }
          resolve(output.trim());
        } else {
          reject(new Error(`Command failed with code ${code}`));
        }
      });
    });
  }

  static async checkContainerStatus(
    containerName: string,
  ): Promise<ContainerStatus> {
    const command = [
      "ps",
      "-a",
      "--filter",
      `name=^/${containerName}$`,
      "--format",
      "{{.ID}}\t{{.State}}",
    ];

    try {
      const output = await this.executeCommand({ command });

      if (!output.trim()) {
        return { exists: false, running: false, id: null };
      }

      const [id, state] = output.trim().split("\t");
      return {
        exists: true,
        running: state === "running",
        id: id,
      };
    } catch (error) {
      console.error("Failed to check container status:", error);
      return { exists: false, running: false, id: null };
    }
  }

  static async startContainer(containerId: string): Promise<void> {
    await this.executeCommand({
      command: ["start", containerId],
      successMessage: `Container ${containerId} started`,
      errorMessage: "Failed to start container",
    });

    // Wait for X server to be ready
    let retries = 30;
    while (retries > 0) {
      try {
        await this.executeCommand({
          command: ["exec", containerId, "xdpyinfo"],
          errorMessage: "X server not ready",
        });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) {
          throw new Error("X server failed to start");
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Restart VNC services
    try {
      // Kill any existing VNC processes
      await this.executeCommand({
        command: ["exec", containerId, "pkill", "-f", "x11vnc"],
        errorMessage: "Failed to kill existing x11vnc",
      }).catch(() => {}); // Ignore if no process exists

      await this.executeCommand({
        command: ["exec", containerId, "pkill", "-f", "websockify"],
        errorMessage: "Failed to kill existing websockify",
      }).catch(() => {}); // Ignore if no process exists

      // Set environment variables and start x11vnc
      await this.executeCommand({
        command: [
          "exec",
          "-d",
          "-e",
          "DISPLAY=:99",
          containerId,
          "x11vnc",
          "-display",
          ":99",
          "-forever",
          "-shared",
          "-rfbport",
          "5900",
          "-nopw",
          "-xkb",
        ],
        errorMessage: "Failed to start x11vnc",
      });

      // Wait for x11vnc to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Start noVNC
      await this.executeCommand({
        command: [
          "exec",
          "-d",
          containerId,
          "websockify",
          "--web",
          "/opt/noVNC",
          "6080",
          "localhost:5900",
        ],
        errorMessage: "Failed to start noVNC",
      });

      // Wait for services to be ready
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Failed to start VNC services:", error);
      throw error;
    }
  }

  static async createContainer(config: {
    containerName: string;
    imageName: string;
    vncPort: number;
    noVNCPort: number;
  }): Promise<string> {
    const { containerName, imageName, vncPort, noVNCPort } = config;

    const output = await this.executeCommand({
      command: [
        "run",
        "-d",
        "--name",
        containerName,
        "-p",
        `${vncPort}:5900`,
        "-p",
        `${noVNCPort}:6080`,
        imageName,
      ],
      successMessage: "Container created successfully",
      errorMessage: "Failed to create container",
    });

    return output; // Returns container ID
  }

  static async checkService(containerId: string): Promise<boolean> {
    try {
      const output = await this.executeCommand({
        command: ["exec", containerId, "netstat", "-tuln"],
      });
      return output.includes(":5900") && output.includes(":6080");
    } catch (error) {
      return false;
    }
  }

  static async takeScreenshot(
    containerId: string,
    screenshotPath: string,
  ): Promise<string> {
    const tempDir = os.tmpdir();
    const tempScreenshotPath = path.join(
      tempDir,
      `screenshot-${Date.now()}.png`,
    );

    try {
      // Check if X server is ready
      try {
        await this.executeCommand({
          command: ["exec", containerId, "xdpyinfo"],
          errorMessage: "X server not ready",
        });
      } catch (error) {
        throw new Error("X server is not running or not accessible");
      }

      // Try scrot first, then fall back to gnome-screenshot if needed
      try {
        await this.executeCommand({
          command: ["exec", containerId, "scrot", "-z", screenshotPath],
          errorMessage: "Screenshot failed",
        });
      } catch {
        await this.executeCommand({
          command: [
            "exec",
            containerId,
            "gnome-screenshot",
            "-f",
            screenshotPath,
          ],
          errorMessage: "Screenshot failed",
        });
      }

      // Copy screenshot from container to host
      await this.executeCommand({
        command: ["cp", `${containerId}:${screenshotPath}`, tempScreenshotPath],
      });

      // Convert to JPEG and get base64
      const imageBuffer = await sharp(tempScreenshotPath).jpeg().toBuffer();
      const base64Image = imageBuffer.toString("base64");

      // Cleanup
      await this.executeCommand({
        command: ["exec", containerId, "rm", screenshotPath],
      });
      await fs.unlink(tempScreenshotPath);

      return base64Image;
    } catch (error) {
      // Cleanup on error
      try {
        await fs.unlink(tempScreenshotPath);
      } catch {}
      throw error;
    }
  }
}
