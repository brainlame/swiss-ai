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
