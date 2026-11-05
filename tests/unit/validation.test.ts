import { describe, it, expect } from 'vitest';
import {
  validateText,
  safeReturn,
  browseParams,
} from '../../src/lib/validation';
describe('citizen input', () => {
  it('requires meaningful text and a valid constitution', () => {
    expect(() => validateText('  ', 'proposal', 1)).toThrow();
    expect(() => validateText('example', '\n\t', 1)).toThrow();
    for (const n of [0, 12, 1.5, NaN])
      expect(() => validateText('example', 'proposal', n)).toThrow();
    expect(() => validateText('example', 'proposal', 11)).not.toThrow();
    expect(() => validateText('x'.repeat(10001), 'proposal', 1)).toThrow();
  });
  it('validates return destinations', () => {
    for (const path of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/%5cevil.test',
      '/%2fevil.test',
      '/auth/callback',
      '/signin',
      '/\nfoo',
    ])
      expect(safeReturn(path)).toBe('/chatbot');
    expect(safeReturn('/my-cases')).toBe('/my-cases');
    expect(safeReturn('/cases/abc/edit')).toBe('/cases/abc/edit');
  });
  it('resets malformed cursors and bounds filters', () => {
    expect(
      browseParams(
        new URL('https://test/cases?constitution=12&time=bad&cursor=x'),
      ),
    ).toMatchObject({
      p_constitution: null,
      p_time: null,
      p_id: null,
      p_oldest: false,
    });
    expect(
      browseParams(
        new URL('https://test/cases?q=care&constitution=3&sort=oldest'),
      ),
    ).toMatchObject({ p_search: 'care', p_constitution: 3, p_oldest: true });
  });
});

describe('trending pagination input', () => {
  it('accepts a complete rank cursor and preserves literal search terms', async () => {
    const { trendingParams } = await import('../../src/lib/validation');
    expect(
      trendingParams(new URL('https://test/issues?q=50%25_&constitution=2')),
    ).toMatchObject({
      p_search: '50%_',
      p_constitution: 2,
      p_upvotes: null,
      p_revision: null,
    });
    expect(
      trendingParams(
        new URL(
          'https://test/api/issues?upvotes=0&time=2026-01-01T00:00:00Z&cursor=11111111-1111-4111-8111-111111111111&revision=9007199254740993',
        ),
      ),
    ).toMatchObject({ p_upvotes: 0, p_revision: '9007199254740993' });
  });
  it('rejects partial, unsafe or negative rank cursors', async () => {
    const { trendingParams } = await import('../../src/lib/validation');
    const base =
      'https://test/api/issues?upvotes=1&time=2026-01-01T00:00:00Z&cursor=11111111-1111-4111-8111-111111111111&revision=2';
    for (const [key, value] of [
      ['upvotes', '-1'],
      ['upvotes', '1.5'],
      ['upvotes', '9007199254740992'],
      ['time', 'bad'],
      ['cursor', 'bad'],
      ['revision', '9223372036854775808'],
      ['revision', ''],
    ]) {
      const url = new URL(base);
      url.searchParams.set(key, value);
      expect(() => trendingParams(url)).toThrow('Invalid ranking cursor');
    }
    const partial = new URL(base);
    partial.searchParams.delete('revision');
    expect(() => trendingParams(partial)).toThrow();
  });
});
