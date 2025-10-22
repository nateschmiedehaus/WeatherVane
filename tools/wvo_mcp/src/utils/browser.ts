import { logError, logInfo } from '../telemetry/logger.js';
import type { LiveFlagsReader } from '../state/live_flags.js';
import { FeatureGates } from '../orchestrator/feature_gates.js';

// Manually define types to avoid hard dependency on @types/playwright
export type Page = {
  goto: (url: string, options?: Record<string, unknown>) => Promise<void>;
  content: () => Promise<string>;
  screenshot: (options: Record<string, unknown>) => Promise<void>;
  setViewport: (viewport: { width: number; height: number; }) => Promise<void>;
  waitForSelector: (selector: string, options?: { timeout?: number; }) => Promise<void>;
  close: () => Promise<void>;
};

export type Browser = {
  newPage: (options?: Record<string, unknown>) => Promise<Page>;
  close: () => Promise<void>;
};

type PlaywrightModule = {
  chromium: {
    launch: (options?: Record<string, unknown>) => Promise<Browser>;
  };
};

class BrowserManager {
  private playwrightModulePromise?: Promise<PlaywrightModule | null>;
  private browserInstancePromise?: Promise<Browser | null>;
  private liveFlags?: LiveFlagsReader;
  private featureGates?: FeatureGates;

  private async getPlaywrightModule(): Promise<PlaywrightModule | null> {
    if (!this.playwrightModulePromise) {
      this.playwrightModulePromise = import('playwright').catch(() => {
        logError('Playwright not installed.', {
          guidance: 'Run `npm install --prefix tools/wvo_mcp playwright` and `npx --yes playwright install chromium --with-deps`.'
        });
        return null;
      });
    }
    return this.playwrightModulePromise;
  }

  public setLiveFlags(flags: LiveFlagsReader): void {
    this.liveFlags = flags;
    this.featureGates = new FeatureGates(flags);
  }

  public async getBrowser(): Promise<Browser | null> {
    if (!this.browserInstancePromise) {
      const playwright = await this.getPlaywrightModule();
      if (!playwright) {
        return null;
      }

      // Determine sandbox mode based on SANDBOX_MODE flag
      // 'pool' = reuse process, 'none' = fresh process (default)
      const useSandboxPool = this.featureGates?.isSandboxPoolEnabled() ?? false;
      const args = [
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ];

      // Apply sandbox settings based on mode
      // In 'pool' mode, enable sandboxing for security in pooled environments
      // In 'none' mode, disable sandbox for compatibility
      if (!useSandboxPool) {
        args.push('--no-sandbox');
        args.push('--disable-setuid-sandbox');
      }

      this.browserInstancePromise = playwright.chromium
        .launch({
          headless: true,
          args,
        })
        .catch((error) => {
          logError('Failed to launch Playwright chromium browser.', { error });
          return null;
        });
    }
    return this.browserInstancePromise;
  }

  public async closeBrowser(): Promise<void> {
    if (this.browserInstancePromise) {
      const browser = await this.browserInstancePromise.catch(() => null);
      if (browser) {
        await browser.close().catch(() => {});
        logInfo('Shared browser instance closed.');
      }
      this.browserInstancePromise = undefined;
    }
  }
}

export const browserManager = new BrowserManager();
