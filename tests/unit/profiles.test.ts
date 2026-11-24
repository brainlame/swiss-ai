import { describe, it, expect } from 'vitest';
import { validateNames, avatarBytes } from '../../src/lib/profile.ts';
describe('profile input validation', () => {
  it('accepts international names and trims whitespace', () =>
    expect(validateNames('  Zoë ', '李 ')).toEqual({
      first: 'Zoë',
      last: '李',
    }));
  it.each([
    [' ', 'Doe'],
    ['Jane', ''],
    ['a'.repeat(81), 'Doe'],
    ['Jane\nAdmin', 'Doe'],
  ])('rejects invalid names', (first, last) =>
    expect(() => validateNames(first, last)).toThrow(),
  );
  it('rejects oversized, SVG and forged image content', async () => {
    for (const file of [
      new File(['<svg/>'], 'avatar.svg', { type: 'image/svg+xml' }),
      new File(['not PNG'], 'photo.png', { type: 'image/png' }),
      new File([new Uint8Array(2097153)], 'photo.png', { type: 'image/png' }),
    ])
      await expect(avatarBytes(file)).rejects.toThrow();
  });
  it('accepts supported image signatures', async () => {
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
      'arbitrary.png',
      { type: 'image/png' },
    );
    expect((await avatarBytes(file)).length).toBe(8);
  });
});
