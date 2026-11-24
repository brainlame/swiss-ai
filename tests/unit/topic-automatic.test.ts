import { describe, expect, it } from 'vitest';
import { sanitizeTopicText } from '../../scripts/topic-automatic.ts';
describe('automatic topic payload filtering', () => {
  it('removes common contact identifiers without removing the concern', () => {
    const text = sanitizeTopicText(
      'Privacy concern: email citizen@example.invalid, https://example.invalid/path, 555-123-4567, 014c0585-163b-412d-9123-8f3c37b3a66f, 10.0.0.1 and 123 Main Street.',
    );
    expect(text).toContain('Privacy concern');
    expect(text).not.toMatch(/citizen@|https:|555|014c0585|10.0.0.1|123 Main/);
  });
  it.each([
    'password: privateValue',
    'api key = sensitiveValue',
    'confidential: internal text',
    '-----BEGIN PRIVATE KEY-----',
  ])('fails closed on possible secrets', (text) => {
    expect(() => sanitizeTopicText(text)).toThrow();
  });
});
