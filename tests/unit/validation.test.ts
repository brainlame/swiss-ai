import { describe, it, expect } from 'vitest';
import {
  validateFile,
  validateCount,
  validateText,
  imageSignature,
  safeReturn,
  browseParams,
  MAX_SIZE,
  validateExchange,
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
  it('accepts only the required screenshot formats and sizes', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp'])
      expect(() => validateFile({ type, size: MAX_SIZE })).not.toThrow();
    for (const file of [
      { type: 'image/svg+xml', size: 4 },
      { type: 'image/png', size: 0 },
      { type: 'image/png', size: MAX_SIZE + 1 },
    ])
      expect(() => validateFile(file)).toThrow();
    expect(() => validateCount(0)).toThrow();
    expect(() => validateCount(6)).toThrow();
    expect(() => validateCount(5)).not.toThrow();
  });
  it('rejects image content that does not match its MIME type', () => {
    expect(
      imageSignature(
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
        'image/png',
      ),
    ).toBe(true);
    expect(
      imageSignature(new TextEncoder().encode('<script>'), 'image/png'),
    ).toBe(false);
    expect(imageSignature(new Uint8Array([255, 216, 255]), 'image/jpeg')).toBe(
      true,
    );
    expect(
      imageSignature(new TextEncoder().encode('RIFF1234WEBP'), 'image/webp'),
    ).toBe(true);
  });
  it('requires screenshots unless complete chat evidence is attached, with a maximum of five', () => {
    expect(() => validateCount(0, false)).toThrow();
    expect(() => validateCount(0, true)).not.toThrow();
    expect(() => validateCount(5, true)).not.toThrow();
    for (const n of [-1, 1.5, 6, NaN])
      expect(() => validateCount(n, true)).toThrow();
    expect(() => validateExchange(null)).not.toThrow();
    expect(() =>
      validateExchange({ prompt: 'hello', response: 'Hello.' }),
    ).not.toThrow();
    for (const value of [
      undefined,
      {},
      'hello',
      { prompt: 'hi' },
      { prompt: '  ', response: 'hi' },
      { prompt: 'hi', response: '\n' },
      { prompt: 'x'.repeat(10001), response: 'hi' },
    ])
      expect(() => validateExchange(value)).toThrow();
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
      expect(safeReturn(path)).toBe('/submit');
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
