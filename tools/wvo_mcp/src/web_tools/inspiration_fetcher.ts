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

type PlaywrightBrowser = {
  newPage: (options?: Record<string, unknown>) => Promise<{
    goto: (url: string, options?: Record<string, unknown>) => Promise<void>;
    content: () => Promise<string>;
    screenshot: (options: Record<string, unknown>) => Promise<void>;
    close: () => Promise<void>;
    context: () => { tracing?: { start: () => Promise<void>; stop: () => Promise<void> } };
    _delegate?: Record<string, unknown>; // placeholder to avoid lint warnings
  }>;
  close: () => Promise<void>;
};

type PlaywrightModule = {
  chromium: {
    launch: (options?: Record<string, unknown>) => Promise<PlaywrightBrowser>;
  };
};

const DEFAULT_ALLOWED_DOMAINS = [
  'awwwards.com',
  'dribbble.com',
  'behance.net',
  'cssnectar.com',
  'siteinspire.com'
];

const MAX_HTML_SIZE_BYTES = 500 * 1024; // 500 KB

export class InspirationFetcher {
  private playwrightModulePromise?: Promise<PlaywrightModule | null>;
  private browserPromise?: Promise<PlaywrightBrowser | null>;
  private readonly baseDir: string;
  private readonly allowedDomains: string[];

  constructor(private readonly workspaceRoot: string) {
    this.baseDir = path.join(this.workspaceRoot, 'state', 'web_inspiration');
    const envDomains = process.env.WVO_WEB_INSPIRATION_DOMAINS;
    this.allowedDomains = envDomains
      ? envDomains.split(',').map((d) => d.trim()).filter(Boolean)
      : DEFAULT_ALLOWED_DOMAINS;
  }

  async capture(input: WebInspirationInput): Promise<WebInspirationResult> {
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

    const playwright = await this.getPlaywright();
    if (!playwright) {
      return {
        success: false,
        metadata: {
          url,
          timestamp: Date.now()
        },
        error:
          'Playwright not installed. Run `npm install --prefix tools/wvo_mcp playwright` and `npx --yes playwright install chromium --with-deps`.'
      };
    }

    const browser = await this.getBrowser(playwright);
    if (!browser) {
      return {
        success: false,
        metadata: {
          url,
          timestamp: Date.now()
        },
        error: 'Failed to launch Playwright chromium browser.'
      };
    }

    const screenshotPath = path.join(recordDir, 'screenshot.png');
    const htmlPath = path.join(recordDir, 'snapshot.html');
    const started = Date.now();

    let page: Awaited<ReturnType<PlaywrightBrowser['newPage']>> | undefined;

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
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => null);
      if (browser) {
        await browser.close().catch(() => {});
      }
      this.browserPromise = undefined;
    }
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

  private async getPlaywright(): Promise<PlaywrightModule | null> {
    if (!this.playwrightModulePromise) {
      this.playwrightModulePromise = import('playwright').catch(() => null);
    }
    return this.playwrightModulePromise;
  }

  private async getBrowser(module: PlaywrightModule): Promise<PlaywrightBrowser | null> {
    if (!this.browserPromise) {
      this.browserPromise = module.chromium
        .launch({
          headless: true,
          args: [
            '--disable-dev-shm-usage',
            '--no-sandbox',
            '--disable-gpu',
            '--disable-setuid-sandbox'
          ]
        })
        .catch(() => null);
    }
    return this.browserPromise;
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
