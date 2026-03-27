import { describe, expect, it } from 'vitest';
import { RedirectMapper } from '../../src/mappers/redirect-mapper';

describe('RedirectMapper', () => {
  it('generates nginx rewrite rules', () => {
    const mapper = new RedirectMapper();
    mapper.add('/old-page', '/new-page');
    mapper.add('/blog/my-post', '/articles/my-post');
    const result = mapper.renderNginx();
    expect(result).toContain('rewrite ^/old-page$ /new-page permanent;');
    expect(result).toContain('rewrite ^/blog/my-post$ /articles/my-post permanent;');
  });

  it('generates Vercel redirects JSON', () => {
    const mapper = new RedirectMapper();
    mapper.add('/old-page', '/new-page');
    const result = mapper.renderVercel();
    const parsed = JSON.parse(result) as { redirects: Array<{ source: string; destination: string; permanent: boolean }> };
    expect(parsed.redirects).toBeInstanceOf(Array);
    expect(parsed.redirects[0]).toMatchObject({
      source: '/old-page',
      destination: '/new-page',
      permanent: true,
    });
  });

  it('generates Next.js redirects array', () => {
    const mapper = new RedirectMapper();
    mapper.add('/old-page', '/new-page');
    const result = mapper.renderNextjs();
    expect(result).toContain("source: '/old-page'");
    expect(result).toContain("destination: '/new-page'");
    expect(result).toContain('permanent: true');
  });
});
