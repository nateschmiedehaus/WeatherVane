/**
 * Screenshot Manager - Intelligent, resilient screenshot capture with auto-detection
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { ScreenshotCapture } from "./screenshot.js";
import { logError, logInfo, logWarning } from "../telemetry/logger.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface ViewportPreset {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

export interface PageDefinition {
  path: string;
  name: string;
  waitForSelector?: string;
  requiresAuth?: boolean;
}

export interface DevServerConfig {
  command: string;
  port: number;
  readyCheck: string; // URL to check if server is ready
  workingDirectory?: string;
}

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { name: "mobile", width: 375, height: 667, deviceScaleFactor: 2 }, // iPhone SE
  { name: "tablet", width: 768, height: 1024, deviceScaleFactor: 2 }, // iPad
  { name: "desktop", width: 1920, height: 1080, deviceScaleFactor: 1 }, // Full HD
];

export interface ScreenshotSession {
  sessionId: string;
  timestamp: string;
  pages: string[];
  viewports: string[];
  success: boolean;
  artifacts: string[];
  errors: string[];
}

export class ScreenshotManager {
  private capture: ScreenshotCapture;
  private devServerProcess: any = null;
  private lastScreenshotSession: ScreenshotSession | null = null;
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // 2 seconds

  constructor(private workspaceRoot: string) {
    this.capture = new ScreenshotCapture();
  }

  /**
   * Check if dev server is running on a port
   */
  private async isServerRunning(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://localhost:${port}`, {
        method: "HEAD",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok || response.status === 404; // 404 is fine, server is running
    } catch {
      return false;
    }
  }

  /**
   * Wait for server to be ready
   */
  private async waitForServer(url: string, maxWait: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(2000),
        });
        if (response.ok || response.status === 404) {
          logInfo(`Server ready at ${url}`);
          return true;
        }
      } catch {
        // Server not ready yet
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  /**
   * Ensure dev server is running, start if needed
   */
  async ensureDevServer(config: DevServerConfig): Promise<boolean> {
    const port = config.port;

    // Check if already running
    if (await this.isServerRunning(port)) {
      logInfo(`Dev server already running on port ${port}`);
      return true;
    }

    logInfo(`Starting dev server: ${config.command}`);

    try {
      // Start dev server in background
      const { spawn } = await import("child_process");
      const cwd = config.workingDirectory || this.workspaceRoot;

      this.devServerProcess = spawn(config.command, [], {
        cwd,
        shell: true,
        detached: true,
        stdio: "ignore",
      });

      this.devServerProcess.unref();

      // Wait for server to be ready
      const ready = await this.waitForServer(config.readyCheck, 30000);

      if (!ready) {
        logError("Dev server failed to start within 30 seconds");
        return false;
      }

      logInfo(`Dev server started successfully on port ${port}`);
      return true;
    } catch (error) {
      logError("Failed to start dev server", {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Auto-detect site structure by crawling
   */
  async discoverPages(baseUrl: string): Promise<PageDefinition[]> {
    const pages: PageDefinition[] = [];

    // Common page patterns
    const commonPaths = [
      { path: "/", name: "homepage", waitForSelector: "body" },
      { path: "/dashboard", name: "dashboard", waitForSelector: "main" },
      { path: "/settings", name: "settings", waitForSelector: "main" },
      { path: "/reports", name: "reports", waitForSelector: "main" },
      { path: "/catalog", name: "catalog", waitForSelector: "main" },
      { path: "/plan", name: "plan", waitForSelector: "main" },
      { path: "/automations", name: "automations", waitForSelector: "main" },
    ];

    for (const pageInfo of commonPaths) {
      const url = `${baseUrl}${pageInfo.path}`;
      try {
        const response = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          pages.push(pageInfo);
        }
      } catch {
        // Page doesn't exist, skip
      }
    }

    if (pages.length === 0) {
      logWarning("No pages discovered, falling back to homepage only");
      pages.push({ path: "/", name: "homepage", waitForSelector: "body" });
    }

    logInfo(`Discovered ${pages.length} pages`, {
      pages: pages.map((p) => p.name).join(", "),
    });

    return pages;
  }

  /**
   * Capture screenshots with retries and error handling
   */
  private async captureWithRetry(
    url: string,
    outputPath: string,
    viewport: ViewportPreset,
    waitForSelector?: string,
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await this.capture.initialize();

        const result = await this.capture.capture({
          url,
          outputPath,
          fullPage: true,
          viewport: { width: viewport.width, height: viewport.height },
          waitForSelector,
          delay: 1000, // Wait 1 second for animations
        });

        if (result.success) {
          logInfo(`Screenshot captured: ${path.basename(outputPath)}`);
          return true;
        }

        if (attempt < this.maxRetries) {
          logWarning(`Screenshot attempt ${attempt} failed, retrying...`, {
            error: result.error,
          });
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        }
      } catch (error) {
        logError(`Screenshot attempt ${attempt} error`, {
          error: error instanceof Error ? error.message : String(error),
        });
        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay));
        }
      }
    }

    return false;
  }

  /**
   * Should we take screenshots now?
   */
  async shouldScreenshot(lastGitSha: string | null): Promise<boolean> {
    try {
      // Check if there are UI changes since last screenshot
      const { stdout: currentSha } = await execAsync("git rev-parse HEAD");
      const currentCommit = currentSha.trim();

      if (!lastGitSha) {
        logInfo("No previous screenshot session, taking screenshots");
        return true;
      }

      if (currentCommit === lastGitSha) {
        logInfo("No code changes since last screenshot, skipping");
        return false;
      }

      // Check if changes include UI files
      const { stdout: changes } = await execAsync(`git diff --name-only ${lastGitSha} HEAD`);
      const changedFiles = changes.split("\n");

      const uiPatterns = [
        /apps\/web\//,
        /\.tsx?$/,
        /\.css$/,
        /\.scss$/,
        /\.vue$/,
        /components\//,
        /pages\//,
        /styles\//,
      ];

      const hasUIChanges = changedFiles.some((file) =>
        uiPatterns.some((pattern) => pattern.test(file)),
      );

      if (hasUIChanges) {
        logInfo("UI changes detected, taking screenshots");
        return true;
      }

      logInfo("No UI changes detected, skipping screenshots");
      return false;
    } catch (error) {
      logWarning("Could not determine if screenshots needed, taking them to be safe");
      return true;
    }
  }

  /**
   * Run comprehensive screenshot session
   */
  async runScreenshotSession(
    baseUrl: string,
    pages?: PageDefinition[],
    viewports?: ViewportPreset[],
  ): Promise<ScreenshotSession> {
    const sessionId = new Date().toISOString().replace(/[:.]/g, "-");
    const timestamp = new Date().toISOString();
    const artifacts: string[] = [];
    const errors: string[] = [];

    // Use provided pages or discover them
    const pagesToCapture = pages || (await this.discoverPages(baseUrl));
    const viewportsToUse = viewports || VIEWPORT_PRESETS;

    logInfo(`Starting screenshot session ${sessionId}`, {
      pages: pagesToCapture.length,
      viewports: viewportsToUse.length,
    });

    const sessionDir = path.join(this.workspaceRoot, "tmp", "screenshots", sessionId);
    await fs.mkdir(sessionDir, { recursive: true });

    let successCount = 0;
    let totalScreenshots = pagesToCapture.length * viewportsToUse.length;

    // Capture each page at each viewport
    for (const page of pagesToCapture) {
      for (const viewport of viewportsToUse) {
        const url = `${baseUrl}${page.path}`;
        const filename = `${page.name}_${viewport.name}.png`;
        const outputPath = path.join(sessionDir, filename);

        const success = await this.captureWithRetry(url, outputPath, viewport, page.waitForSelector);

        if (success) {
          artifacts.push(outputPath);
          successCount++;
        } else {
          errors.push(`Failed to capture ${page.name} at ${viewport.name}`);
        }
      }
    }

    // Record session metadata
    const session: ScreenshotSession = {
      sessionId,
      timestamp,
      pages: pagesToCapture.map((p) => p.name),
      viewports: viewportsToUse.map((v) => v.name),
      success: successCount === totalScreenshots,
      artifacts,
      errors,
    };

    const metadataPath = path.join(sessionDir, "session.json");
    await fs.writeFile(metadataPath, JSON.stringify(session, null, 2));

    this.lastScreenshotSession = session;

    logInfo(`Screenshot session completed`, {
      sessionId,
      success: successCount,
      total: totalScreenshots,
      successRate: `${((successCount / totalScreenshots) * 100).toFixed(1)}%`,
    });

    return session;
  }

  /**
   * Get last screenshot session
   */
  getLastSession(): ScreenshotSession | null {
    return this.lastScreenshotSession;
  }

  /**
   * Cleanup old screenshot sessions (keep last 5)
   */
  async cleanupOldSessions(): Promise<void> {
    const screenshotsDir = path.join(this.workspaceRoot, "tmp", "screenshots");

    try {
      const entries = await fs.readdir(screenshotsDir, { withFileTypes: true });
      const sessionDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => ({
          name: e.name,
          path: path.join(screenshotsDir, e.name),
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by timestamp (newest first)

      // Keep only last 5 sessions
      const toDelete = sessionDirs.slice(5);

      for (const dir of toDelete) {
        await fs.rm(dir.path, { recursive: true, force: true });
        logInfo(`Cleaned up old screenshot session: ${dir.name}`);
      }
    } catch (error) {
      logWarning("Failed to cleanup old screenshots", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    await this.capture.close();

    if (this.devServerProcess) {
      try {
        this.devServerProcess.kill();
        logInfo("Dev server stopped");
      } catch (error) {
        logWarning("Failed to stop dev server", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
