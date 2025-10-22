import shopifyApp from "@shopify/shopify-app-express";
import { DeliveryMethod, LATEST_API_VERSION } from "@shopify/shopify-api";

import { config } from "./env";
import { FileSessionStorage } from "./storage/file-session-storage";
import { persistTenantCredential } from "./utils/token-store";

const sessionStorage = new FileSessionStorage(config.sessionStoragePath);

const shopify = shopifyApp({
  api: {
    apiKey: config.apiKey,
    apiSecretKey: config.apiSecret,
    scopes: config.scopes,
    hostName: config.hostName,
    hostScheme: config.hostScheme,
    apiVersion: LATEST_API_VERSION,
    isEmbeddedApp: true,
    sessionStorage,
  },
  auth: {
    path: "/auth",
    callbackPath: "/auth/callback",
    afterAuth: async ({ session, app, req, res }) => {
      const offlineId = `offline_${session.shop}`;
      const offlineSession = await app.api.sessionStorage.loadSession(offlineId);
      config.logger.info(
        {
          shop: session.shop,
          scopes: session.scope,
          offlineToken: Boolean(offlineSession?.accessToken),
        },
        "Shopify shop authenticated",
      );

      if (offlineSession?.accessToken) {
        await persistTenantCredential({
          shop: session.shop,
          accessToken: offlineSession.accessToken,
          scope: offlineSession.scope ?? session.scope,
        });
      }

      await app.webhooks.register({ session });
      res.redirect(`/?shop=${session.shop}`);
    },
  },
  webhooks: {
    path: "/webhooks",
    apiVersion: LATEST_API_VERSION,
    webhookHandlers: {
      APP_UNINSTALLED: {
        deliveryMethod: DeliveryMethod.Http,
        callbackUrl: "/webhooks",
        callback: async (_topic, shop) => {
          config.logger.info({ shop }, "Shopify app uninstalled");
          const offlineId = `offline_${shop}`;
          await sessionStorage.deleteSession(offlineId);
        },
      },
    },
  },
});

export default shopify;
export { sessionStorage };

export async function loadOfflineSession(shop: string) {
  const offlineId = shop.startsWith("offline_") ? shop : `offline_${shop}`;
  return sessionStorage.loadSession(offlineId);
}
