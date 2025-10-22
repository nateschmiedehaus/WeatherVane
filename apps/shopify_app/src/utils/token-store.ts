import { promises as fs } from "fs";
import path from "path";

import { config } from "../env";

type PersistedCredential = {
  shop: string;
  accessToken: string;
  scope?: string | null;
  obtainedAt: string;
};

const WEBHOOK_TIMEOUT_MS = 5000;

export async function persistTenantCredential(input: { shop: string; accessToken: string; scope?: string | null }) {
  const payload: PersistedCredential = {
    shop: input.shop,
    accessToken: input.accessToken,
    scope: input.scope ?? null,
    obtainedAt: new Date().toISOString(),
  };

  await ensureDirectory(config.tokenStorePath);
  const filePath = path.join(config.tokenStorePath, `${sanitiseShopDomain(input.shop)}.json`);
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
  config.logger.info({ shop: input.shop, destination: filePath }, "Stored WeatherVane Shopify credentials");

  if (config.tokenWebhookUrl) {
    await POSTTokenWebhook(payload).catch((error) => {
      config.logger.warn(
        { shop: input.shop, err: error },
        "Failed to notify WeatherVane token webhook",
      );
    });
  }
}

async function ensureDirectory(target: string) {
  await fs.mkdir(target, { recursive: true });
}

async function POSTTokenWebhook(payload: PersistedCredential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetch(config.tokenWebhookUrl as string, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        shop: payload.shop,
        access_token: payload.accessToken,
        scope: payload.scope,
        obtained_at: payload.obtainedAt,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Token webhook responded with ${response.status} ${response.statusText} ${text}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function sanitiseShopDomain(shop: string): string {
  return shop.replace(/[^a-zA-Z0-9.-]/g, "_");
}
