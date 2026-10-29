export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeReturn(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//'))
    return '/chatbot';
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f]/.test(decoded) || decoded.startsWith('//'))
      return '/chatbot';
    const target = new URL(value, 'https://return.invalid');
    if (
      target.origin !== 'https://return.invalid' ||
      target.pathname.startsWith('/auth') ||
      target.pathname.startsWith('/signin')
    )
      return '/chatbot';
    return target.pathname + target.search;
  } catch {
    return '/chatbot';
  }
}
export function validateText(
  description: string,
  improvement: string,
  constitution: number,
) {
  if (!description.trim() || !improvement.trim())
    throw new Error('Description and proposed improvement are required.');
  if (description.length > 10000 || improvement.length > 10000)
    throw new Error('Keep each text field to 10,000 characters or fewer.');
  if (!Number.isInteger(constitution) || constitution < 1 || constitution > 11)
    throw new Error('Select one of the 11 constitutions.');
}
export function browseParams(url: URL) {
  const filter = Number(url.searchParams.get('constitution'));
  const time = url.searchParams.get('time'),
    id = url.searchParams.get('cursor');
  return {
    p_search: (url.searchParams.get('q') ?? '').trim().slice(0, 200),
    p_constitution:
      Number.isInteger(filter) && filter >= 1 && filter <= 11 ? filter : null,
    p_oldest: url.searchParams.get('sort') === 'oldest',
    p_time:
      time && !Number.isNaN(Date.parse(time)) && id && UUID.test(id)
        ? time
        : null,
    p_id:
      time && !Number.isNaN(Date.parse(time)) && id && UUID.test(id)
        ? id
        : null,
  };
}

// Shared with the SQL constraint: complete alternating pairs, bounded count and text.
export function validateTranscript(
  value: unknown,
): asserts value is import('#lib/chat-evidence.js').Transcript {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.length > 100 ||
    value.length % 2 !== 0
  )
    throw new Error(
      'Attach a complete conversation with 2–100 messages from Chatbot.',
    );
  let total = 0;
  for (const [index, message] of value.entries()) {
    if (
      !message ||
      typeof message !== 'object' ||
      Object.keys(message).sort().join(',') !== 'role,text' ||
      message.role !== (index % 2 === 0 ? 'user' : 'assistant') ||
      typeof message.text !== 'string' ||
      !message.text.trim() ||
      message.text.length > 10000
    )
      throw new Error(
        'Conversation messages must alternate between user and chatbot and contain 1–10,000 characters.',
      );
    total += message.text.length;
  }
  if (total > 100000)
    throw new Error(
      'This conversation is too long to attach. Start a shorter conversation (100,000 characters maximum).',
    );
}
export function validateBehavior(
  value: unknown,
): asserts value is 'good' | 'bad' {
  if (value !== 'good' && value !== 'bad')
    throw new Error('Choose good / wanted or bad / unwanted behavior.');
}
