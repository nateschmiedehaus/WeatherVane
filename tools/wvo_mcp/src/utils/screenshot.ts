/**
 * Screenshot Utility - Capture web pages for design review
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
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
  private browser: Browser | null = null;

  async initialize(): Promise<void> {
    if (this.browser) return;

    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      logInfo("Screenshot browser initialized");
    } catch (error) {
      logError("Failed to initialize screenshot browser", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async capture(options: ScreenshotOptions): Promise<ScreenshotResult> {
    try {
      await this.initialize();
      if (!this.browser) {
        throw new Error("Browser not initialized");
      }

      const page: Page = await this.browser.newPage();

      // Set viewport
      if (options.viewport) {
        await page.setViewport(options.viewport);
      } else {
        await page.setViewport({ width: 1920, height: 1080 });
      }

      // Navigate to URL
      logInfo(`Navigating to ${options.url}`);
      await page.goto(options.url, { waitUntil: "networkidle2", timeout: 30000 });

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
        await page.screenshot({ ...screenshotOptions, path: screenshotPath as `${string}.png` });
      } else {
        // Generate temporary path
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const filename = `screenshot_${timestamp}.png` as `${string}.png`;
        screenshotPath = path.join(process.cwd(), "tmp", "screenshots", filename);
        await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ ...screenshotOptions, path: screenshotPath as `${string}.png` });
      }

      // Get base64 encoding for immediate use
      const buffer = await fs.readFile(screenshotPath);
      const base64 = buffer.toString("base64");

      await page.close();

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

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logInfo("Screenshot browser closed");
    }
  }
}
