import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { URL } from 'node:url';

import { logError, logInfo } from '../telemetry/logger.js';

import { ObservabilityMetricsLoader } from './metrics_loader.js';
import { ObservabilityMetricsProvider } from './metrics_provider.js';

export interface ObservabilityServerOptions {
  workspaceRoot: string;
  port?: number;
  host?: string;
  cacheTtlMs?: number;
}

type Handler = () => Promise<unknown>;

export class ObservabilityServer {
  private readonly provider: ObservabilityMetricsProvider;
  private server?: http.Server;

  constructor(private readonly options: ObservabilityServerOptions) {
    const loader = new ObservabilityMetricsLoader(options.workspaceRoot);
    this.provider = new ObservabilityMetricsProvider(loader, options.cacheTtlMs);
  }

  private route(pathname: string): Handler | undefined {
    switch (pathname) {
      case '/healthz':
        return async () => ({ status: 'ok', timestamp: new Date().toISOString() });
      case '/api/metrics/tasks':
        return () => this.provider.getTaskMetrics();
      case '/api/metrics/quality_gates':
        return () => this.provider.getQualityGateMetrics();
      case '/api/metrics/usage':
        return () => this.provider.getUsageSnapshot();
      default:
        return undefined;
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const handler = this.route(url.pathname);

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    if (!handler) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const payload = await handler();
      res.writeHead(200);
      res.end(JSON.stringify(payload));
    } catch (error) {
      logError('Observability handler failed', {
        pathname: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    const port = this.options.port ?? 3030;
    const host = this.options.host ?? '127.0.0.1';

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', err => reject(err));
      this.server?.listen(port, host, () => resolve());
    });

    logInfo('Observability server started', { port, host });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close(err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.server = undefined;
    this.provider.clearCache();
    logInfo('Observability server stopped');
  }

  getAddress(): AddressInfo | string | null | undefined {
    return this.server?.address();
  }

  async fetch(pathname: string): Promise<unknown> {
    const handler = this.route(pathname);
    if (!handler) {
      throw new Error(`No handler for ${pathname}`);
    }
    return handler();
  }
}
