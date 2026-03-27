export type RedirectFormat = 'nginx' | 'vercel' | 'nextjs';

export interface RedirectEntry {
  source: string;
  destination: string;
  permanent: boolean;
}

export interface NginxRedirect {
  from: string;
  to: string;
  statusCode: 301 | 302;
}

export interface VercelRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

export interface NextjsRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

export type RedirectOutput =
  | { format: 'nginx'; redirects: NginxRedirect[] }
  | { format: 'vercel'; redirects: VercelRedirect[] }
  | { format: 'nextjs'; redirects: NextjsRedirect[] };

/**
 * Converts URI-to-URI mappings into redirect config for nginx, Vercel, and Next.js.
 */
export class RedirectMapper {
  private readonly entries: RedirectEntry[] = [];

  /**
   * Add a single redirect entry.
   */
  add(source: string, destination: string, permanent = true): this {
    this.entries.push({
      source: this.normalisePath(source),
      destination: this.normalisePath(destination),
      permanent,
    });
    return this;
  }

  /**
   * Bulk-add from a URI map (source → destination).
   */
  addFromMap(map: Record<string, string>, permanent = true): this {
    for (const [source, destination] of Object.entries(map)) {
      this.add(source, destination, permanent);
    }
    return this;
  }

  /**
   * Derive redirects from slug changes between old and new entries.
   * Compares by entry id; entries with the same id but different slugs become redirects.
   */
  addFromSlugChanges(
    oldEntries: Array<{ id: string; slug: string }>,
    newEntries: Array<{ id: string; slug: string }>,
    basePath = '',
    permanent = true,
  ): this {
    const newMap = new Map(newEntries.map((e) => [e.id, e.slug]));

    for (const old of oldEntries) {
      const newSlug = newMap.get(old.id);
      if (newSlug && newSlug !== old.slug) {
        const from = `${basePath}/${old.slug}`;
        const to = `${basePath}/${newSlug}`;
        this.add(from, to, permanent);
      }
    }

    return this;
  }

  /**
   * Generate output in the requested format.
   */
  generate(format: RedirectFormat): RedirectOutput {
    switch (format) {
      case 'nginx':
        return { format: 'nginx', redirects: this.toNginx() };
      case 'vercel':
        return { format: 'vercel', redirects: this.toVercel() };
      case 'nextjs':
        return { format: 'nextjs', redirects: this.toNextjs() };
    }
  }

  /**
   * Render nginx rewrite directives as a string block.
   */
  renderNginx(): string {
    const lines = this.toNginx().map(
      (r) =>
        `rewrite ^${escapeRegex(r.from)}$ ${r.to} ${r.statusCode === 301 ? 'permanent' : 'redirect'};`,
    );
    return lines.join('\n');
  }

  /**
   * Render vercel.json `redirects` array as a JSON string.
   */
  renderVercel(): string {
    return JSON.stringify({ redirects: this.toVercel() }, null, 2);
  }

  /**
   * Render Next.js next.config.ts redirects() function body.
   */
  renderNextjs(): string {
    const items = this.toNextjs()
      .map(
        (r) =>
          `  {\n    source: '${r.source}',\n    destination: '${r.destination}',\n    permanent: ${r.permanent},\n  }`,
      )
      .join(',\n');

    return `// next.config.ts — add inside module.exports or defineConfig\nasync redirects() {\n  return [\n${items}\n  ];\n}`;
  }

  getEntries(): readonly RedirectEntry[] {
    return this.entries;
  }

  clear(): void {
    this.entries.length = 0;
  }

  private toNginx(): NginxRedirect[] {
    return this.entries.map((e) => ({
      from: e.source,
      to: e.destination,
      statusCode: e.permanent ? 301 : 302,
    }));
  }

  private toVercel(): VercelRedirect[] {
    return this.entries.map((e) => ({
      source: e.source,
      destination: e.destination,
      permanent: e.permanent,
    }));
  }

  private toNextjs(): NextjsRedirect[] {
    return this.entries.map((e) => ({
      source: e.source,
      destination: e.destination,
      permanent: e.permanent,
    }));
  }

  private normalisePath(path: string): string {
    // Ensure leading slash, remove trailing slash (except root)
    const p = path.startsWith('/') ? path : `/${path}`;
    return p.length > 1 ? p.replace(/\/$/, '') : p;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
