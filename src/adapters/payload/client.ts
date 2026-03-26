export interface PayloadClientConfig {
  baseUrl: string;
  apiKey?: string;
  email?: string;
  password?: string;
  timeout?: number;
}

export interface PayloadListResponse<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
}

/**
 * REST client for Payload CMS.
 * Supports both API key and email/password authentication.
 */
export class PayloadClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private authHeader: string;

  constructor(private readonly config: PayloadClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 30_000;
    this.authHeader = config.apiKey ? `API-Key ${config.apiKey}` : '';
  }

  async authenticate(): Promise<void> {
    if (this.config.apiKey) return; // already set via header
    if (!this.config.email || !this.config.password) {
      throw new Error('PayloadClient requires either apiKey or email+password');
    }

    const response = await fetch(`${this.baseUrl}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Payload authentication failed: ${response.status}`);
    }

    const json = (await response.json()) as { token: string };
    this.authHeader = `JWT ${json.token}`;
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/globals`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async list<T>(collection: string, page = 1, limit = 50): Promise<PayloadListResponse<T>> {
    const url = new URL(`${this.baseUrl}/${collection}`);
    url.searchParams.set('page', String(page));
    url.searchParams.set('limit', String(limit));

    const response = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Payload list failed for ${collection}: ${response.status}`);
    }

    return response.json() as Promise<PayloadListResponse<T>>;
  }

  async create<T>(collection: string, data: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}/${collection}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Payload create failed for ${collection}: ${response.status} ${body}`);
    }

    const json = (await response.json()) as { doc: T };
    return json.doc;
  }

  async findBySlug<T>(collection: string, slug: string): Promise<T | null> {
    const url = new URL(`${this.baseUrl}/${collection}`);
    url.searchParams.set('where[slug][equals]', slug);
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) return null;

    const json = (await response.json()) as PayloadListResponse<T>;
    return json.docs[0] ?? null;
  }

  async delete(collection: string, id: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/${collection}/${id}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Payload delete failed for ${collection}/${id}: ${response.status}`);
    }
  }

  private headers(): Record<string, string> {
    return {
      Authorization: this.authHeader,
      Accept: 'application/json',
    };
  }
}
