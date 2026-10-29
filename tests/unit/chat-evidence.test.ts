import { describe, expect, it } from 'vitest';
import {
  attachConversation,
  takeConversation,
  clearConversation,
  evidenceFor,
} from '../../src/lib/chat-evidence';
import { validateTranscript, validateBehavior } from '../../src/lib/validation';
const transcript = [
  { role: 'user' as const, text: 'hello' },
  { role: 'assistant' as const, text: 'Hello.' },
];
describe('immutable full conversation snapshots', () => {
  it('copies all messages before chat lifecycle clearing and consumes only once', () => {
    const source = [
      ...transcript,
      ...transcript.map((m) => ({ ...m, text: m.text + ' again' })),
    ];
    attachConversation(source);
    source[0] = { role: 'user', text: 'changed' };
    source.length = 0;
    const snapshot = takeConversation()!;
    expect(snapshot).toHaveLength(4);
    expect(snapshot[0].text).toBe('hello');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    expect(takeConversation()).toBeNull();
    attachConversation(transcript);
    clearConversation();
    expect(takeConversation()).toBeNull();
  });
  it('validates chronological roles, meaningful text, strict structure and bounds', () => {
    expect(() => validateTranscript(transcript)).not.toThrow();
    for (const value of [
      null,
      [],
      [transcript[0]],
      [transcript[1], transcript[0]],
      [{ ...transcript[0], user_id: 'secret' }, transcript[1]],
      [{ role: 'user', text: '  ' }, transcript[1]],
      [{ role: 'user', text: 'x'.repeat(10001) }, transcript[1]],
      Array(102).fill(transcript[0]),
      Array.from({ length: 100 }, (_, i) => ({
        role: i % 2 ? 'assistant' : 'user',
        text: 'x'.repeat(1001),
      })),
    ])
      expect(() => validateTranscript(value)).toThrow();
  });
  it('preserves legacy pair display and never silently classifies historical cases', () => {
    expect(
      evidenceFor({
        transcript: null,
        chat_prompt: 'hello',
        chat_response: 'Hello.',
      }),
    ).toEqual(transcript);
    expect(
      evidenceFor({ transcript: null, chat_prompt: null, chat_response: null }),
    ).toBeNull();
    for (const value of [null, undefined, '', 'mixed'])
      expect(() => validateBehavior(value)).toThrow();
    expect(() => validateBehavior('good')).not.toThrow();
    expect(() => validateBehavior('bad')).not.toThrow();
  });
});
