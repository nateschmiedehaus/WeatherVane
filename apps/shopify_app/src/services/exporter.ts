import type { Session } from "@shopify/shopify-api";
import { config } from "../env";
import shopify from "../shopify";

type ExportResource =
  | "orders"
  | "products"
  | "customers"
  | "inventory_levels"
  | "price_rules"
  | "discount_codes";

type ExportOptions = {
  limit?: number;
  status?: string;
  updatedAtMin?: string;
  updatedAtMax?: string;
  createdAtMin?: string;
  createdAtMax?: string;
  priceRuleId?: string;
};

type ResourceSpec = {
  path: string;
  key: string;
  defaultQuery?: Record<string, unknown>;
};

const RESOURCE_SPECS: Record<ExportResource, ResourceSpec> = {
  orders: {
    path: "orders",
    key: "orders",
    defaultQuery: { status: "any", limit: 250, order: "updated_at asc" },
  },
  products: {
    path: "products",
    key: "products",
    defaultQuery: { limit: 250, order: "updated_at asc" },
  },
  customers: {
    path: "customers",
    key: "customers",
    defaultQuery: { limit: 250, order: "updated_at asc" },
  },
  inventory_levels: {
    path: "inventory_levels",
    key: "inventory_levels",
    defaultQuery: { limit: 250 },
  },
  price_rules: {
    path: "price_rules",
    key: "price_rules",
    defaultQuery: { limit: 250 },
  },
  discount_codes: {
    path: "discount_codes",
    key: "discounts",
    defaultQuery: { limit: 250 },
  },
};

export function isExportResource(value: string): value is ExportResource {
  return Object.hasOwn(RESOURCE_SPECS, value);
}

export async function exportResource(session: Session, resource: ExportResource, options: ExportOptions = {}) {
  const spec = RESOURCE_SPECS[resource];
  if (!spec) {
    throw new Error(`Unsupported export resource "${resource}"`);
  }

  const client = new shopify.api.clients.Rest({ session });

  const maxRecords = Math.min(options.limit ?? config.exportMaxRecords, config.exportMaxRecords);
  const baseQuery: Record<string, unknown> = { ...(spec.defaultQuery ?? {}) };

  if (options.status) {
    baseQuery.status = options.status;
  }
  if (options.updatedAtMin) {
    baseQuery.updated_at_min = options.updatedAtMin;
  }
  if (options.updatedAtMax) {
    baseQuery.updated_at_max = options.updatedAtMax;
  }
  if (options.createdAtMin) {
    baseQuery.created_at_min = options.createdAtMin;
  }
  if (options.createdAtMax) {
    baseQuery.created_at_max = options.createdAtMax;
  }

  const collected: unknown[] = [];

  const path = resolvePath(spec.path, resource, options);

  const paginator = client.paginate({
    path,
    query: baseQuery,
  });

  for await (const page of paginator) {
    const body = page.body as Record<string, unknown>;
    const payload = (body[spec.key] as unknown[]) ?? [];
    collected.push(...payload);
    if (collected.length >= maxRecords) {
      break;
    }
    if (!page.pageInfo?.nextPage) {
      break;
    }
  }

  if (collected.length > maxRecords) {
    collected.length = maxRecords;
  }

  return {
    resource,
    count: collected.length,
    data: collected,
  };
}

function resolvePath(pathTemplate: string, resource: ExportResource, options: ExportOptions): string {
  if (resource === "discount_codes") {
    if (!options.priceRuleId) {
      throw new Error("priceRuleId is required to export discount codes");
    }
    return `price_rules/${options.priceRuleId}/discount_codes`;
  }
  return pathTemplate;
}
