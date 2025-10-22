import dotenv from "dotenv";
import pino from "pino";

dotenv.config();

const REQUIRED_ENV = ["SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_APP_URL", "SHOPIFY_SCOPES"] as const;

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables for Shopify app: ${missing.join(", ")}`);
}

const rawUrl = process.env.SHOPIFY_APP_URL as string;
let url: URL;
try {
  url = new URL(rawUrl);
} catch (error) {
  throw new Error(`SHOPIFY_APP_URL must be a valid URL (received "${rawUrl}")`);
}

const scopes = (process.env.SHOPIFY_SCOPES as string)
  .split(",")
  .map((scope) => scope.trim())
  .filter((scope) => scope.length > 0);

if (scopes.length === 0) {
  throw new Error("SHOPIFY_SCOPES must include at least one scope.");
}

const sessionStoragePath = process.env.SESSION_STORAGE_PATH || "storage/sessions.json";
const port = Number.parseInt(process.env.PORT || "3000", 10);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`PORT must be a positive integer (received "${process.env.PORT}")`);
}

const logLevel = (process.env.LOG_LEVEL || "info").toLowerCase();
const tokenStorePath = process.env.WEATHERVANE_TOKEN_STORE_PATH || "storage/tenants";
const tokenWebhookUrl = process.env.WEATHERVANE_TOKEN_WEBHOOK_URL;
const exportMaxRecords = Number.parseInt(process.env.EXPORT_MAX_RECORDS || "2500", 10);

if (Number.isNaN(exportMaxRecords) || exportMaxRecords <= 0) {
  throw new Error(`EXPORT_MAX_RECORDS must be a positive integer (received "${process.env.EXPORT_MAX_RECORDS}")`);
}

export const config = {
  apiKey: process.env.SHOPIFY_API_KEY as string,
  apiSecret: process.env.SHOPIFY_API_SECRET as string,
  appUrl: rawUrl,
  hostName: url.host,
  hostScheme: url.protocol.replace(":", ""),
  scopes,
  sessionStoragePath,
  port,
  logger: pino({
    name: "weathervane-shopify-app",
    level: logLevel,
  }),
  tokenStorePath,
  tokenWebhookUrl,
  exportMaxRecords,
} as const;
