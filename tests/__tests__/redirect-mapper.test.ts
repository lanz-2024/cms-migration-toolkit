import { describe, expect, it } from 'vitest';
import { RedirectMapper } from '../../src/mappers/redirect-mapper';

describe('RedirectMapper', () => {
  const mapper = new RedirectMapper();
  const redirects = [
    { from: '/old-page', to: '/new-page' },
    { from: '/blog/my-post', to: '/articles/my-post' },
  ];

  it('generates nginx rewrite rules', () => {
    const result = mapper.toNginx(redirects);
    expect(result).toContain('rewrite ^/old-page$ /new-page permanent;');
    expect(result).toContain('rewrite ^/blog/my-post$ /articles/my-post permanent;');
  });

  it('generates Vercel redirects JSON', () => {
    const result = mapper.toVercel(redirects);
    const parsed = JSON.parse(result);
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed[0]).toMatchObject({
      source: '/old-page',
      destination: '/new-page',
      permanent: true,
    });
  });

  it('generates Next.js redirects array', () => {
    const result = mapper.toNextJs(redirects);
    expect(result).toContain("source: '/old-page'");
    expect(result).toContain("destination: '/new-page'");
    expect(result).toContain('permanent: true');
  });
});
