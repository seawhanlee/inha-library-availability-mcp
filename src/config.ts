export interface AppConfig {
  catalogBaseUrl: string;
  catalogCollectionId: number;
  inhaSearchUrl: string;
  edsWidgetUrl: string;
  edsKey: string;
  edsProfile: string;
  edsSessionKey: string;
  timeoutMs: number;
  cacheTtlMs: number;
  concurrency: number;
}

// These values are published in Inha Library's guest-facing web application.
const PUBLIC_INHA_EDS_KEY = 'eyJjdCI6InIzV3dNVkxXRHRZOXRzZm5cL1h1TnJ3cmJUZjQ5REN4UTE4WnQ1N1RsOVwvUUg5UUJNZzNVdmpVbmtvUWI1Q0lIVjJFTklNRW1vTDkwNkh4dlN3aFl4SGc9PSIsIml2IjoiMTIwMzk3Y2RkMmVjODI3NGEwMTA4ODg3MjMyMGE5ZmQiLCJzIjoiMTI5YjQyNmM0ZTA5OTE4MCJ9';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    catalogBaseUrl: env.INHA_CATALOG_BASE_URL ?? 'https://lib.inha.ac.kr/pyxis-api',
    catalogCollectionId: Number(env.INHA_CATALOG_COLLECTION_ID ?? 1),
    inhaSearchUrl: env.INHA_SEARCH_URL ?? 'https://lib.inha.ac.kr/search',
    edsWidgetUrl: env.INHA_EDS_WIDGET_URL ?? 'https://widgets.ebscohost.com/prod/encryptedkey/eds/eds.php',
    edsKey: env.INHA_EDS_KEY ?? PUBLIC_INHA_EDS_KEY,
    edsProfile: env.INHA_EDS_PROFILE ?? 'aW5oYS5tYWluLmVkc2FwaQ==',
    edsSessionKey: env.INHA_EDS_SESSION_KEY ?? '0,0,1,0,0,0',
    timeoutMs: Number(env.INHA_SOURCE_TIMEOUT_MS ?? 8_000),
    cacheTtlMs: Number(env.INHA_CACHE_TTL_MS ?? 5 * 60_000),
    concurrency: Number(env.INHA_BATCH_CONCURRENCY ?? 4)
  };
}
