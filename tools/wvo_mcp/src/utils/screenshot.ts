/**
 * Screenshot Utility - Capture web pages for design review
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { browserManager, type Page } from "./browser.js"; // Using the new shared browser manager
import { logError, logInfo } from "../telemetry/logger.js";

export interface ScreenshotOptions {
  url: string;
  outputPath?: string;
  fullPage?: boolean;
  viewport?: { width: number; height: number };
  waitForSelector?: string;
  delay?: number;
}

export interface ScreenshotResult {
  success: boolean;
  path?: string;
  base64?: string;
  width?: number;
  height?: number;
  error?: string;
}

export class ScreenshotCapture {
  // The browser instance is now managed by the singleton browserManager
  
  async capture(options: ScreenshotOptions): Promise<ScreenshotResult> {
    let page: Page | undefined;
    try {
      const browser = await browserManager.getBrowser();
      if (!browser) {
        throw new Error("Browser could not be initialized. Playwright might not be installed.");
      }

      page = await browser.newPage();

      // Set viewport
      if (options.viewport) {
        await page.setViewport(options.viewport);
      } else {
        await page.setViewport({ width: 1920, height: 1080 });
      }

      // Navigate to URL
      logInfo(`Navigating to ${options.url}`);
      await page.goto(options.url, { waitUntil: "networkidle", timeout: 30000 });

      // Wait for specific selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      }

      // Additional delay if specified
      if (options.delay) {
        await new Promise((resolve) => setTimeout(resolve, options.delay));
      }

      // Capture screenshot
      const screenshotOptions = {
        fullPage: options.fullPage !== false,
        type: "png" as const,
      };

      let screenshotPath: string;
      if (options.outputPath) {
        screenshotPath = options.outputPath;
        await page.screenshot({ ...screenshotOptions, path: screenshotPath });
      } else {
        // Generate temporary path
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `screenshot_${timestamp}.png`;
        screenshotPath = path.join(process.cwd(), "tmp", "screenshots", filename);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ ...screenshotOptions, path: screenshotPath });
      }

      // Get base64 encoding for immediate use
      const buffer = await fs.readFile(screenshotPath);
      const base64 = buffer.toString("base64");

      logInfo(`Screenshot captured: ${screenshotPath}`);

      return {
        success: true,
        path: screenshotPath,
        base64,
        width: options.viewport?.width || 1920,
        height: options.viewport?.height || 1080,
      };
    } catch (error) {
      logError("Screenshot capture failed", {
        error: error instanceof Error ? error.message : String(error),
        url: options.url,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
        if (page) {
            await page.close().catch(() => {});
        }
    }
  }

  async captureMultiple(pages: { url: string; name: string }[]): Promise<Map<string, ScreenshotResult>> {
    const results = new Map<string, ScreenshotResult>();

    for (const pageInfo of pages) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const outputPath = path.join(
        process.cwd(),
        "tmp",
        "screenshots",
        `${pageInfo.name}_${timestamp}.png`,
      );

      const result = await this.capture({
        url: pageInfo.url,
        outputPath,
        fullPage: true,
      });

      results.set(pageInfo.name, result);
    }

    return results;
  }

  // The close method is no longer needed here, as the browserManager handles it globally.
  // A global shutdown hook should call browserManager.closeBrowser()
}