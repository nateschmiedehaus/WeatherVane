import type { ContextWarning } from "./context";

export interface CatalogCategory {
  name: string;
  geo_group_id: string;
  channel: string;
  weather_tags: string[];
  season_tags: string[];
  status: string;
  lift: string;
}

export interface CatalogResponse {
  tenant_id: string;
  generated_at: string;
  categories: CatalogCategory[];
  context_tags: string[];
  data_context?: Record<string, unknown> | null;
  context_warnings?: ContextWarning[];
}
