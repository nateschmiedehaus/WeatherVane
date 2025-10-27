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
  corsOrigin?: string;
  streamIntervalMs?: number;
}

type Handler = () => Promise<unknown>;

export class ObservabilityServer {
  private readonly provider: ObservabilityMetricsProvider;
  private server?: http.Server;
  private streamClients = new Set<http.ServerResponse>();
  private streamTimer?: NodeJS.Timeout;

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
      case '/api/metrics/resolution':
        return () => this.provider.getResolutionMetrics();
      case '/api/metrics/resources':
        return () => this.provider.getResourceSnapshot();
      default:
        return undefined;
    }
  }

  private applyCorsHeaders(res: http.ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', this.options.corsOrigin ?? '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');

    if (req.method === 'OPTIONS') {
      this.applyCorsHeaders(res);
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/api/metrics/stream') {
      this.handleStream(req, res);
      return;
    }

    if (url.pathname === '/api/metrics/export/tasks') {
      await this.handleCsvResponse(res, 'tasks.csv', () => this.provider.getTaskExportCsv());
      return;
    }

    if (url.pathname === '/api/metrics/export/resolution') {
      await this.handleCsvResponse(res, 'resolution_loops.csv', () =>
        this.provider.getResolutionExportCsv()
      );
      return;
    }

    const handler = this.route(url.pathname);

    this.applyCorsHeaders(res);
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

  private handleStream(req: http.IncomingMessage, res: http.ServerResponse): void {
    this.applyCorsHeaders(res);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');
    this.streamClients.add(res);

    void this.provider
      .getStreamPayload()
      .then((payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      })
      .catch((error) => {
        logError('Observability stream initial payload failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });

    req.on('close', () => {
      this.streamClients.delete(res);
    });
  }

  private async handleCsvResponse(
    res: http.ServerResponse,
    filename: string,
    factory: () => Promise<string>
  ): Promise<void> {
    this.applyCorsHeaders(res);
    try {
      const csv = await factory();
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.writeHead(200);
      res.end(csv);
    } catch (error) {
      logError('Observability CSV export failed', {
        filename,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500);
      res.end('error');
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
      this.server?.once('error', (err) => reject(err));
      this.server?.listen(port, host, () => resolve());
    });

    this.startStreamTimer();
    logInfo('Observability server started', { port, host });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    this.stopStreamTimer();
    for (const client of this.streamClients) {
      client.end();
    }
    this.streamClients.clear();
    this.server = undefined;
    this.provider.clearCache();
    logInfo('Observability server stopped');
  }

  getAddress(): AddressInfo | string | null | undefined {
    return this.server?.address();
  }

  async fetch(pathname: string): Promise<unknown> {
    if (pathname === '/api/metrics/export/tasks') {
      return this.provider.getTaskExportCsv();
    }
    if (pathname === '/api/metrics/export/resolution') {
      return this.provider.getResolutionExportCsv();
    }
    const handler = this.route(pathname);
    if (!handler) {
      throw new Error(`No handler for ${pathname}`);
    }
    return handler();
  }

  private startStreamTimer(): void {
    this.stopStreamTimer();
    const interval = this.options.streamIntervalMs ?? 1000;
    this.streamTimer = setInterval(() => {
      void this.pushStreamUpdate();
    }, interval);
  }

  private stopStreamTimer(): void {
    if (this.streamTimer) {
      clearInterval(this.streamTimer);
      this.streamTimer = undefined;
    }
  }

  private async pushStreamUpdate(): Promise<void> {
    if (this.streamClients.size === 0) {
      return;
    }
    try {
      const payload = await this.provider.getStreamPayload();
      const data = `data: ${JSON.stringify(payload)}\n\n`;
      for (const client of this.streamClients) {
        client.write(data);
      }
    } catch (error) {
      logError('Observability stream update failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
