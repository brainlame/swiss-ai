export type TranscriptMessage = Readonly<{
  role: 'user' | 'assistant';
  text: string;
}>;
export type Transcript = readonly TranscriptMessage[];
// A one-use, frozen browser-memory snapshot. No message text in URLs or storage.
let pending: Transcript | null = null;
export function attachConversation(messages: Transcript) {
  pending = Object.freeze(
    messages.map(({ role, text }) => Object.freeze({ role, text })),
  );
}
export function takeConversation(): Transcript | null {
  const value = pending;
  pending = null;
  return value;
}
export function clearConversation() {
  pending = null;
}
export function evidenceFor(item: {
  transcript: Transcript | null;
  chat_prompt: string | null;
  chat_response: string | null;
}): Transcript | null {
  return (
    item.transcript ??
    (item.chat_prompt && item.chat_response
      ? [
          { role: 'user', text: item.chat_prompt },
          { role: 'assistant', text: item.chat_response },
        ]
      : null)
  );
}
