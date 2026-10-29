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

describe('continuous issue selections and Back to chat', () => {
  const full = Array.from({ length: 4 }, (_, i) => [
    { role: 'user' as const, text: 'Prompt ' + i },
    { role: 'assistant' as const, text: 'Reply ' + i },
  ]).flat();
  it('slices inclusive whole exchanges without gaps or extra context', async () => {
    const { selectConversation } = await import('../../src/lib/chat-evidence');
    expect(selectConversation(full, { start: 1, end: 2 })).toEqual(
      full.slice(2, 6),
    );
    expect(selectConversation(full, { start: 2, end: 2 })).toEqual(
      full.slice(4, 6),
    );
    for (const range of [
      { start: -1, end: 1 },
      { start: 2, end: 1 },
      { start: 0, end: 4 },
      { start: 0.5, end: 1 },
      { start: NaN, end: 1 },
    ])
      expect(() => selectConversation(full, range)).toThrow();
    expect(() =>
      selectConversation(full.slice(0, 3), { start: 0, end: 0 }),
    ).toThrow();
  });
  it('returns the whole chat, original selection and unsent message, while submitting only the selected section', async () => {
    const { returnToConversation, discardIssueFlow } =
      await import('../../src/lib/chat-evidence');
    discardIssueFlow();
    attachConversation(full, { start: 1, end: 2 }, 'Unsent message');
    expect(takeConversation()).toEqual(full.slice(2, 6));
    expect(returnToConversation()).toEqual({
      messages: full,
      range: { start: 1, end: 2 },
      draft: 'Unsent message',
    });
    clearConversation();
    expect(returnToConversation()?.messages).toHaveLength(8);
    discardIssueFlow();
    expect(returnToConversation()).toBeNull();
    expect(takeConversation()).toBeNull();
  });
  it('preserves form fields and retry IDs, but changes the ID when changing the attachment', async () => {
    const { rememberIssueDraft, issueDraft, discardIssueFlow } =
      await import('../../src/lib/chat-evidence');
    discardIssueFlow();
    attachConversation(full, { start: 1, end: 2 });
    takeConversation();
    rememberIssueDraft({
      id: 'retry-id',
      description: 'Description',
      improvement: 'Proposal',
      constitution: 4,
      behavior: 'good',
    });
    attachConversation(full, { start: 1, end: 2 });
    expect(issueDraft()?.id).toBe('retry-id');
    attachConversation(full, { start: 0, end: 1 });
    expect(issueDraft()).toMatchObject({
      id: '',
      description: 'Description',
      constitution: 4,
      behavior: 'good',
    });
    discardIssueFlow();
    expect(issueDraft()).toBeNull();
  });
});
