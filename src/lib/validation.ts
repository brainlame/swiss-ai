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

// A rank cursor is a complete tuple; never silently restart a malformed page.
export function trendingParams(url: URL) {
  const { p_search, p_constitution } = browseParams(url);
  const values = ['upvotes', 'time', 'cursor', 'revision'].map((key) =>
    url.searchParams.get(key),
  );
  if (values.every((value) => value === null))
    return {
      p_search,
      p_constitution,
      p_upvotes: null,
      p_time: null,
      p_id: null,
      p_revision: null,
    };
  const [upvotes, time, id, revision] = values;
  if (
    !upvotes ||
    !/^\d{1,16}$/.test(upvotes) ||
    !Number.isSafeInteger(Number(upvotes)) ||
    !time ||
    !/^\d{4}-\d{2}-\d{2}T/.test(time) ||
    !Number.isFinite(Date.parse(time)) ||
    !id ||
    !UUID.test(id) ||
    !revision ||
    !/^\d{1,19}$/.test(revision) ||
    BigInt(revision) > 9223372036854775807n
  )
    throw new Error(
      'Invalid ranking cursor. Refresh the issues and try again.',
    );
  return {
    p_search,
    p_constitution,
    p_upvotes: Number(upvotes),
    p_time: time,
    p_id: id,
    p_revision: revision,
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
