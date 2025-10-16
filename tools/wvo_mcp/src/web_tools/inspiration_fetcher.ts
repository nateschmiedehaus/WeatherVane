import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface WebInspirationInput {
  url: string;
  taskId?: string;
  viewport?: {
    width: number;
    height: number;
  };
  timeoutMs?: number;
}

export interface WebInspirationResult {
  success: boolean;
  screenshotPath?: string;
  htmlPath?: string;
  metadata: {
    url: string;
    timestamp: number;
    screenshotSizeKb?: number;
    htmlSizeKb?: number;
    loadDurationMs?: number;
    cached?: boolean;
  };
  error?: string;
}

import { browserManager, type Page } from '../utils/browser.js';

const DEFAULT_INSPIRATION_DOMAINS = [
  'www.awwwards.com',
  'awwwards.com',
  'dribbble.com',
  'www.dribbble.com',
  'behance.net',
  'www.behance.net'
];

const MAX_HTML_SIZE_BYTES = 500 * 1024; // 500 KB

export class InspirationFetcher {
  private readonly baseDir: string;
  private allowedDomains: string[] = [];
  private initializationPromise: Promise<void> | null = null;

  constructor(private readonly workspaceRoot: string) {
    this.baseDir = path.join(this.workspaceRoot, 'state', 'web_inspiration');
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    const envDomains = process.env.WVO_WEB_INSPIRATION_DOMAINS;
    if (envDomains) {
      this.allowedDomains = envDomains.split(',').map((d) => d.trim()).filter(Boolean);
      return;
    }

    try {
      const configPath = path.join(this.workspaceRoot, 'config', 'inspiration_sites.json');
      const rawConfig = await fs.readFile(configPath, 'utf-8');
      const domains = JSON.parse(rawConfig);
      if (Array.isArray(domains) && domains.every(d => typeof d === 'string')) {
        this.allowedDomains = domains;
        if (this.allowedDomains.length === 0) {
          this.allowedDomains = [...DEFAULT_INSPIRATION_DOMAINS];
        }
        return;
      }
    } catch {
      // Ignore error and use curated defaults if config is missing or invalid
      this.allowedDomains = [...DEFAULT_INSPIRATION_DOMAINS];
      return;
    }

    this.allowedDomains = [...DEFAULT_INSPIRATION_DOMAINS];
  }

  public addInspirationSource(url: string): void {
    try {
      const hostname = new URL(url).hostname;
      if (!this.allowedDomains.includes(hostname)) {
        this.allowedDomains.push(hostname);
      }
    } catch {
      // Ignore invalid URLs
    }
  }
  async capture(input: WebInspirationInput): Promise<WebInspirationResult> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    const { url } = input;
    if (!this.isAllowedDomain(url)) {
      return {
        success: false,
        metadata: {
          url,
          timestamp: Date.now()
        },
        error: `Domain not in allow-list: ${url}`
      };
    }

    const recordDir = await this.getTargetDirectory(input.taskId);
    const metadataPath = path.join(recordDir, 'metadata.json');

    const cached = await this.readMetadata(metadataPath);
    if (cached) {
      return {
        success: true,
        screenshotPath: cached.screenshotPath,
        htmlPath: cached.htmlPath,
        metadata: {
          ...cached.metadata,
          cached: true
        }
      };
    }

    try {
      await fs.mkdir(recordDir, { recursive: true });
    } catch (error) {
      return {
        success: false,
        metadata: {
          url,
          timestamp: Date.now()
        },
        error: `Unable to create directory: ${(error as Error).message}`
      };
    }

    const browser = await browserManager.getBrowser();
    if (!browser) {
        return {
            success: false,
            metadata: {
                url,
                timestamp: Date.now()
            },
            error: 'Browser could not be initialized. Playwright might not be installed.'
        };
    }

    const screenshotPath = path.join(recordDir, 'screenshot.png');
    const htmlPath = path.join(recordDir, 'snapshot.html');
    const started = Date.now();

    let page: Page | undefined;

    try {
      const viewport = input.viewport ?? { width: 1920, height: 1080 };
      page = await browser.newPage({
        viewport,
        javaScriptEnabled: true,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      await page.goto(url, {
        timeout: input.timeoutMs ?? 10_000,
        waitUntil: 'networkidle'
      });

      await page.screenshot({
        path: screenshotPath,
        fullPage: false,
        type: 'png'
      });

      let html = await page.content();
      html = this.stripTracking(html);
      const htmlBuffer = Buffer.from(html, 'utf-8');

      if (htmlBuffer.byteLength > MAX_HTML_SIZE_BYTES) {
        // truncate gracefully
        await fs.writeFile(htmlPath, htmlBuffer.subarray(0, MAX_HTML_SIZE_BYTES).toString());
      } else {
        await fs.writeFile(htmlPath, htmlBuffer);
      }

      const screenshotStats = await fs.stat(screenshotPath).catch(() => ({ size: 0 }));
      const htmlStats = await fs.stat(htmlPath).catch(() => ({ size: 0 }));

      const metadata = {
        url,
        timestamp: Date.now(),
        screenshotSizeKb: Math.round(screenshotStats.size / 1024),
        htmlSizeKb: Math.round(htmlStats.size / 1024),
        loadDurationMs: Date.now() - started,
        cached: false
      };

      await this.writeMetadata(metadataPath, {
        screenshotPath,
        htmlPath,
        metadata
      });

      return {
        success: true,
        screenshotPath,
        htmlPath,
        metadata
      };
    } catch (error) {
      await this.safeUnlink(screenshotPath);
      await this.safeUnlink(htmlPath);
      return {
        success: false,
        metadata: {
          url,
          timestamp: Date.now()
        },
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  async dispose(): Promise<void> {
    // The shared browser manager can be closed via a global shutdown hook if needed
    await browserManager.closeBrowser();
  }

  private async getTargetDirectory(taskId?: string): Promise<string> {
    if (taskId) {
      return path.join(this.baseDir, this.sanitize(taskId));
    }
    return path.join(this.baseDir, randomUUID());
  }

  private async readMetadata(metadataPath: string): Promise<{
    screenshotPath?: string;
    htmlPath?: string;
    metadata: WebInspirationResult['metadata'];
  } | null> {
    try {
      const raw = await fs.readFile(metadataPath, 'utf-8');
      const parsed = JSON.parse(raw) as {
        screenshotPath?: string;
        htmlPath?: string;
        metadata: WebInspirationResult['metadata'];
      };
      if (!parsed.metadata) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private async writeMetadata(
    metadataPath: string,
    payload: {
      screenshotPath?: string;
      htmlPath?: string;
      metadata: WebInspirationResult['metadata'];
    }
  ): Promise<void> {
    await fs.writeFile(metadataPath, JSON.stringify(payload, null, 2), 'utf-8');
  }

  private sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9-_]+/g, '_');
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
  }

  private isAllowedDomain(url: string): boolean {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return this.allowedDomains.some((domain) => hostname.includes(domain.toLowerCase()));
    } catch {
      return false;
    }
  }

  private stripTracking(html: string): string {
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
      .replace(/https?:\/\/www\.google-analytics\.com\/[^"' ]+/gi, '')
      .replace(/https?:\/\/www\.googletagmanager\.com\/[^"' ]+/gi, '')
      .replace(/https?:\/\/connect\.facebook\.net\/[^"' ]+/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  }
}
