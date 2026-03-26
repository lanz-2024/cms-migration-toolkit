export interface CraftGraphQLConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
}

export interface CraftGraphQLResponse<T> {
  data: T;
  errors?: Array<{ message: string; locations?: unknown[] }>;
}

/**
 * Minimal GraphQL client for Craft CMS.
 * In production this would use a proper HTTP client (e.g. ky, got).
 * Here it provides a typed interface and stub for testing.
 */
export class CraftClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeout: number;

  constructor(config: CraftGraphQLConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30_000;
  }

  async query<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Craft GraphQL request failed: ${response.status} ${response.statusText}`);
      }

      const json = (await response.json()) as CraftGraphQLResponse<T>;

      if (json.errors && json.errors.length > 0) {
        const messages = json.errors.map((e) => e.message).join(', ');
        throw new Error(`Craft GraphQL errors: ${messages}`);
      }

      return json.data;
    } finally {
      clearTimeout(timer);
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/graphql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query: '{ ping }' }),
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
