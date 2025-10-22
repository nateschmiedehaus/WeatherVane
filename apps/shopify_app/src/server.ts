import type { NextFunction, Request, Response } from "express";
import express from "express";

import { config } from "./env";
import shopify, { loadOfflineSession } from "./shopify";
import { exportResource, isExportResource } from "./services/exporter";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get(shopify.config.auth.path, shopify.auth.begin());
app.get(
  shopify.config.auth.callbackPath,
  shopify.auth.callback(),
  shopify.redirectToShopifyOrAppRoot(),
);

app.post(shopify.config.webhooks.path, shopify.webhooks.process());

app.get("/internal/offline/export/:resource", async (req, res, next) => {
  try {
    const resourceParam = req.params.resource;

    if (typeof resourceParam !== "string") {
      res.status(400).json({ error: "missing_resource", message: "Specify resource name in path" });
      return;
    }

    if (!isExportResource(resourceParam)) {
      res.status(400).json({
        error: "unsupported_resource",
        message: `Unsupported resource "${resourceParam}". Allowed: orders, products, customers, inventory_levels, price_rules, discount_codes`,
      });
      return;
    }

    const resource = resourceParam;
    const shop = req.query.shop;

    if (typeof shop !== "string" || shop.length === 0) {
      res
        .status(400)
        .json({ error: "missing_shop", message: "Provide ?shop=your-domain.myshopify.com" });
      return;
    }

    const session = await loadOfflineSession(shop);
    if (!session) {
      res.status(404).json({ error: "offline_session_not_found", shop });
      return;
    }

    const {
      limit,
      status,
      updated_at_min,
      updated_at_max,
      created_at_min,
      created_at_max,
      price_rule_id,
    } = req.query;

    const numericLimit =
      typeof limit === "string"
        ? Number.parseInt(limit, 10)
        : Array.isArray(limit)
          ? Number.parseInt(limit[0] ?? "", 10)
          : undefined;

    const payload = await exportResource(session, resource, {
      limit: Number.isFinite(numericLimit) ? numericLimit : undefined,
      status: typeof status === "string" ? status : undefined,
      updatedAtMin: typeof updated_at_min === "string" ? updated_at_min : undefined,
      updatedAtMax: typeof updated_at_max === "string" ? updated_at_max : undefined,
      createdAtMin: typeof created_at_min === "string" ? created_at_min : undefined,
      createdAtMax: typeof created_at_max === "string" ? created_at_max : undefined,
      priceRuleId: typeof price_rule_id === "string" ? price_rule_id : undefined,
    }).catch((error: unknown) => {
      if (error instanceof Error && error.message.includes("priceRuleId")) {
        res.status(400).json({
          error: "missing_price_rule_id",
          message: "Provide ?price_rule_id=<id> when exporting discount codes",
        });
        return null;
      }
      throw error;
    });

    if (!payload) {
      return;
    }

    res.json({
      shop,
      resource: payload.resource,
      count: payload.count,
      data: payload.data,
    });
  } catch (error) {
    next(error);
  }
});

app.use("/api/*", shopify.validateAuthenticatedSession());

app.get("/api/orders/sample", async (_req, res, next) => {
  try {
    const session = res.locals.shopify.session;
    const client = new shopify.api.clients.Rest({ session });
    const response = await client.get({
      path: "orders",
      query: { limit: 10, order: "updated_at desc", status: "any" },
    });
    res.json(response.body);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  config.logger.error({ err: error }, "Unhandled error in Shopify app");
  res.status(500).json({ error: "internal_error" });
});

app.listen(config.port, () => {
  config.logger.info({ port: config.port, url: config.appUrl }, "WeatherVane Shopify app ready");
});
