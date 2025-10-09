import type { ConfidenceLevel } from "./plan";
import type { ContextWarning } from "./context";

export interface WeatherStory {
  title: string;
  summary: string;
  detail: string;
  icon: string | null;
  confidence: ConfidenceLevel;
  plan_date: string;
  category: string;
  channel: string;
}

export interface StoriesResponse {
  tenant_id: string;
  generated_at: string;
  stories: WeatherStory[];
  context_tags: string[];
  data_context?: Record<string, unknown> | null;
  context_warnings?: ContextWarning[];
}
