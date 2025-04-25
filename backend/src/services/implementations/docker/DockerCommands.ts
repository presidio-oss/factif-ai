import { spawn } from "child_process";
import { DockerCommandOptions, ContainerStatus } from "./DockerTypes";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

export class DockerCommands {
  // Track if we've already shown error messages to prevent duplicates
  private static hasShownDockerInstalledMessage: boolean = false;
  private static hasShownDockerRunningMessage: boolean = false;

  // Helper method to display a clear message when Docker is not installed
  private static displayDockerNotInstalledMessage(): void {
    if (this.hasShownDockerInstalledMessage) return;
    
    console.log(
      "\n============================================================================="
    );
    console.log(
      "DOCKER NOT INSTALLED - Ubuntu VNC feature requires Docker to be installed"
    );
    console.log(
      "Please install Docker from https://docs.docker.com/get-docker/"
    );
    console.log(
      "=============================================================================\n"
    );
    
    this.hasShownDockerInstalledMessage = true;
  }

  // Helper method to display a clear message when Docker is not running
  private static displayDockerNotRunningMessage(): void {
    if (this.hasShownDockerRunningMessage) return;
    
    console.log(
      "\n============================================================================="
    );
    console.log(
      "DOCKER NOT RUNNING - Ubuntu VNC feature requires Docker to be running locally"
    );
    console.log(
      "=============================================================================\n"
    );
    
    this.hasShownDockerRunningMessage = true;
  }
  static async executeCommand({
    command,
    successMessage,
    errorMessage,
  }: DockerCommandOptions): Promise<string> {
    return new Promise((resolve, reject) => {
      let docker;
      
      try {
        docker = spawn("docker", command);
      } catch (err) {
        this.displayDockerNotInstalledMessage();
        return resolve(""); // Resolve with empty string instead of rejecting
      }
      
      let output = "";
      let errorOutput = "";

      docker.on('error', (err: NodeJS.ErrnoException) => {
        // Check if the error is due to Docker not being installed
        if (err.code === 'ENOENT') {
          // Don't log the full error stack trace, just show our friendly message
          this.displayDockerNotInstalledMessage();
          resolve(""); // Resolve with empty string instead of rejecting
        } else {
          reject(err);
        }
      });

      docker.stdout.on("data", (data) => {
        output += data.toString();
      });

      docker.stderr.on("data", (data) => {
        const error = data.toString();
        errorOutput += error;
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
          // Check common patterns that suggest Docker isn't running
          const isDockerNotRunning =
            output.includes("Cannot connect to the Docker daemon") ||
            output.includes("Is the docker daemon running") ||
            output.includes("docker daemon is not running") ||
            output.includes("connection refused") ||
            errorOutput.includes("Cannot connect to the Docker daemon") ||
            errorOutput.includes("Is the docker daemon running") ||
            errorOutput.includes("docker daemon is not running") ||
            errorOutput.includes("connection refused");

          if (isDockerNotRunning) {
            this.displayDockerNotRunningMessage();
          } else {
            reject(new Error(`Command failed with code ${code}`));
          }
        }
      });
    });
  }

  static async checkContainerStatus(
    containerName: string
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

      // When Docker is not installed or not running, executeCommand will return an empty string
      if (output === "") {
        // Docker is not available - already logged by executeCommand method
        return { exists: false, running: false, id: null };
      }

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

    console.log("Ensuring X server is running...");

    // First check if environment variables are properly set
    try {
      const envOutput = await this.executeCommand({
        command: ["exec", containerId, "env"],
        successMessage: "Retrieved container environment",
      });

      console.log(`Container environment: ${envOutput}`);

      if (!envOutput.includes("DISPLAY=")) {
        console.log("DISPLAY not set in environment, setting it explicitly");
        await this.executeCommand({
          command: ["exec", containerId, "export", "DISPLAY=:99"],
          successMessage: "Set DISPLAY environment variable",
        });
      }
    } catch (error) {
      console.error("Could not check container environment:", error);
    }

    // Explicitly restart Xvfb to ensure it's running with our settings
    try {
      console.log("Preparing X server environment...");

      // Check if /tmp/.X11-unix exists and has proper permissions
      await this.executeCommand({
        command: [
          "exec",
          containerId,
          "bash",
          "-c",
          "mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix",
        ],
        successMessage: "Prepared X11 socket directory",
      });

      // Clean up any stale X lock files that might be causing issues
      console.log("Cleaning up any stale X server files...");
      await this.executeCommand({
        command: [
          "exec",
          containerId,
          "bash",
          "-c",
          "rm -f /tmp/.X99-lock /tmp/.X11-unix/X99",
        ],
        successMessage: "Cleaned up stale X server files",
      });

      // Kill any existing Xvfb processes to ensure clean state
      console.log("Killing any existing Xvfb processes...");
      await this.executeCommand({
        command: ["exec", containerId, "pkill", "-f", "Xvfb"],
      }).catch(() => {
        // Ignore errors if Xvfb isn't running
        console.log("No existing Xvfb processes to kill");
      });

      // Create log directory for Xvfb
      await this.executeCommand({
        command: ["exec", containerId, "mkdir", "-p", "/tmp/xvfb_logs"],
        successMessage: "Created Xvfb log directory",
      });

      console.log("Starting Xvfb with detailed logging...");
      // Start Xvfb with proper environment variables and logging
      const xvfbOutput = await this.executeCommand({
        command: [
          "exec",
          "-e",
          "DISPLAY=:99",
          "-e",
          "DISPLAY_NUM=99",
          "-e",
          "WIDTH=1280",
          "-e",
          "HEIGHT=720",
          containerId,
          "/bin/bash",
          "-c",
          "cd /app && ./xvfb_startup.sh",
        ],
        successMessage: "Started Xvfb",
      });

      console.log("Xvfb startup output:", xvfbOutput);

      // Check if the marker file exists to indicate successful startup
      try {
        await this.executeCommand({
          command: [
            "exec",
            containerId,
            "test",
            "-f",
            "/tmp/xvfb_started_successfully",
          ],
        });
        console.log(
          "Xvfb startup marker file found - X server started successfully"
        );
      } catch (e) {
        console.warn(
          "Xvfb startup marker file not found - may indicate startup issues"
        );

        // Tail the Xvfb log file to see what happened
        try {
          const xvfbLog = await this.executeCommand({
            command: ["exec", containerId, "cat", "/tmp/xvfb_output.log"],
          });
          console.log("Xvfb log contents:", xvfbLog);
        } catch (logError) {
          console.error("Could not read Xvfb logs:", logError);
        }
      }

      // Give Xvfb time to fully initialize even if marker file exists
      console.log("Waiting for Xvfb to fully initialize...");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } catch (error) {
      console.error("Error restarting Xvfb:", error);
      // Try to get logs for debugging
      try {
        const xvfbLog = await this.executeCommand({
          command: ["exec", containerId, "cat", "/tmp/xvfb_output.log"],
        });
        console.error("Xvfb log contents for debugging:", xvfbLog);
      } catch (logError) {
        // Just continue if we can't get logs
      }
    }

    // Wait for X server to be ready
    let retries = 60; // Increased from 30 to 60 seconds
    let errorMessages = [];
    while (retries > 0) {
      try {
        await this.executeCommand({
          command: ["exec", "-e", "DISPLAY=:99", containerId, "xdpyinfo"],
        });
        console.log("X server is ready");
        break;
      } catch (error) {
        errorMessages.push(
          error instanceof Error ? error.message : String(error)
        );
        retries--;
        if (retries === 0) {
          console.error("X server check error logs:", errorMessages.join("\n"));
          throw new Error(
            "X server failed to start: Check for missing display or permissions issues"
          );
        }
        // Log every 10 seconds
        if (retries % 10 === 0) {
          console.log(`Still waiting for X server, ${retries} attempts left`);

          // Try to get diagnostic information
          try {
            const ps = await this.executeCommand({
              command: ["exec", containerId, "bash", "-c", "ps aux | grep X"],
            });
            console.log("X process status:", ps);
          } catch (e) {
            // Ignore
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Start window manager and panel
    try {
      console.log("Starting window manager and panel...");

      // Start mutter window manager with additional environment variables to prevent X11 warnings
      await this.executeCommand({
        command: [
          "exec",
          "-d",
          "-e",
          "DISPLAY=:99",
          "-e",
          "MUTTER_DEBUG=0", // Suppress debug output
          "-e",
          "MUTTER_VERBOSE=0", // Suppress verbose messages
          containerId,
          "/bin/bash",
          "-c",
          "cd /app && ./mutter_startup.sh",
        ],
        successMessage: "Started mutter window manager",
      });

      // Give mutter time to initialize
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Start tint2 panel
      await this.executeCommand({
        command: [
          "exec",
          "-d",
          "-e",
          "DISPLAY=:99",
          containerId,
          "/bin/bash",
          "-c",
          "cd /app && ./tint2_startup.sh",
        ],
        successMessage: "Started tint2 panel",
      });

      // Give tint2 time to initialize
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Start PCManFM for desktop icons using the dedicated script
      await this.executeCommand({
        command: [
          "exec",
          "-d",
          "-e",
          "DISPLAY=:99",
          "-e",
          "HOME=/home/computeruse", // Ensure HOME is set correctly for config
          containerId,
          "/bin/bash",
          "-c",
          "cd /app && chmod +x ./pcmanfm_startup.sh && ./pcmanfm_startup.sh",
        ],
        successMessage: "Started desktop manager",
      });

      // Give PCManFM time to initialize
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error("Failed to start window manager and panel:", error);
      // Continue even if window manager fails, as VNC might still work
    }

    // Restart VNC services
    try {
      console.log("Starting VNC services...");

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
      console.log("Starting x11vnc...");
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

  static async checkServiceDetailed(
    containerId: string
  ): Promise<{ vncReady: boolean; noVncReady: boolean }> {
    try {
      const output = await this.executeCommand({
        command: ["exec", containerId, "netstat", "-tuln"],
      });

      const vncReady = output.includes(":5900");
      const noVncReady = output.includes(":6080");

      return {
        vncReady,
        noVncReady,
      };
    } catch (error) {
      console.error("Failed to check service status:", error);
      return {
        vncReady: false,
        noVncReady: false,
      };
    }
  }

  static async takeScreenshot(
    containerId: string,
    screenshotPath: string
  ): Promise<string> {
    const tempDir = os.tmpdir();
    const tempScreenshotPath = path.join(
      tempDir,
      `screenshot-${Date.now()}.png`
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
