export type TranscriptMessage = Readonly<{
  role: 'user' | 'assistant';
  text: string;
}>;
export type Transcript = readonly TranscriptMessage[];
export type ConversationRange = Readonly<{ start: number; end: number }>;
export type IssueFormDraft = {
  id: string;
  description: string;
  improvement: string;
  constitution: number;
  behavior: 'good' | 'bad' | '';
};
const freeze = (messages: Transcript): Transcript =>
  Object.freeze(
    messages.map(({ role, text }) => Object.freeze({ role, text })),
  );
// Select whole exchanges, inclusively. Slicing once makes gaps impossible.
export function selectConversation(
  messages: Transcript,
  range: ConversationRange,
): Transcript {
  const exchanges = messages.length / 2;
  if (
    !Number.isInteger(exchanges) ||
    exchanges < 1 ||
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.end < range.start ||
    range.end >= exchanges
  )
    throw new Error('Choose a continuous range of complete exchanges.');
  for (const [i, message] of messages.entries())
    if (message.role !== (i % 2 ? 'assistant' : 'user'))
      throw new Error(
        'Wait for the chatbot to finish replying before selecting.',
      );
  return freeze(messages.slice(range.start * 2, (range.end + 1) * 2));
}
type IssueFlow = {
  messages: Transcript;
  range: ConversationRange;
  selected: Transcript;
  chatDraft: string;
  form: IssueFormDraft | null;
};
// Browser memory only: the full chat never enters URLs, storage or the issue API.
// Keep a return context only while moving between Chatbot and the unsaved form.
let pending: Transcript | null = null;
let flow: IssueFlow | null = null;
export function attachConversation(
  messages: Transcript,
  range: ConversationRange = { start: 0, end: messages.length / 2 - 1 },
  chatDraft = '',
) {
  const selected = selectConversation(messages, range);
  const form = flow?.form ? { ...flow.form } : null;
  // A changed attachment is a new submission, while an unchanged retry keeps its ID.
  if (form && JSON.stringify(selected) !== JSON.stringify(flow?.selected))
    form.id = '';
  flow = {
    messages: freeze(messages),
    range: Object.freeze({ ...range }),
    selected,
    chatDraft,
    form,
  };
  pending = selected;
}
export function takeConversation(): Transcript | null {
  const value = pending;
  pending = null;
  return value;
}
export function clearConversation() {
  pending = null;
}
export function returnToConversation() {
  if (!flow) return null;
  return { messages: flow.messages, range: flow.range, draft: flow.chatDraft };
}
export function rememberIssueDraft(draft: IssueFormDraft) {
  if (flow) flow.form = { ...draft };
}
export function issueDraft(): IssueFormDraft | null {
  return flow?.form ? { ...flow.form } : null;
}
export function discardIssueFlow() {
  pending = null;
  flow = null;
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
