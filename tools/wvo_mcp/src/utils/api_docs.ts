export const API_DOC_HINTS: Record<string, string[]> = {
  "meta marketing": ["docs/api/meta_marketing.md"],
  "facebook ads": ["docs/api/meta_marketing.md"],
  "google ads": ["docs/api/google_ads.md"],
  "shopify": ["docs/api/shopify_admin_rest.md"],
  "open-meteo": ["docs/api/open_meteo.md"],
  "prefect": ["docs/api/prefect_flows.md"],
};

export function matchApiDocs(taskTitle: string, existing: string[]): string[] {
  const lower = taskTitle.toLowerCase();
  const matches = new Set(existing);

  for (const [hint, docs] of Object.entries(API_DOC_HINTS)) {
    if (lower.includes(hint)) {
      docs.forEach((doc) => matches.add(doc));
    }
  }

  return Array.from(matches);
}
