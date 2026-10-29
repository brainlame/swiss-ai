import { describe, it, expect, vi } from 'vitest';
import {
  relativeTime,
  validateComment,
  validateVote,
  appendComments,
  type Comment,
} from '../../src/lib/discussion';
import { GET, POST } from '../../src/routes/api/cases/[id]/discussion/+server';
const id = 'aaaaaaaa-0000-4000-8000-000000000001';
function event(
  body: unknown = {},
  options: { user?: boolean; origin?: string; query?: string } = {},
) {
  const rpc = vi
    .fn()
    .mockResolvedValue({ data: { items: [], has_more: false }, error: null });
  return {
    rpc,
    event: {
      params: { id },
      url: new URL(
        'https://app.test/api/cases/' +
          id +
          '/discussion' +
          (options.query ?? ''),
      ),
      request: new Request('https://app.test/api/cases/' + id + '/discussion', {
        method: 'POST',
        headers: {
          origin: options.origin ?? 'https://app.test',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      }),
      locals: {
        user: options.user === false ? null : { id: 'private' },
        supabase: { rpc },
      },
    } as unknown as Parameters<typeof POST>[0],
  };
}
describe('discussion input, relative times and API boundaries', () => {
  it('formats timestamps without losing singular/plural or future-date handling', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    for (const [seconds, label] of [
      [0, 'just now'],
      [60, '1 minute ago'],
      [3600, '1 hour ago'],
      [18000, '5 hours ago'],
      [86400, '1 day ago'],
      [2592000, '1 month ago'],
      [31536000, '1 year ago'],
    ] as const)
      expect(
        relativeTime(new Date(now - seconds * 1000).toISOString(), now),
      ).toBe(label);
    expect(relativeTime(new Date(now + 1000).toISOString(), now)).toBe(
      'just now',
    );
  });
  it('validates meaningful comments, bounded size, and exact vote values', () => {
    for (const value of ['', ' \t\n', null, {}, 'x'.repeat(2001)])
      expect(() => validateComment(value)).toThrow();
    expect(() => validateComment('A helpful example')).not.toThrow();
    for (const value of [-1, 0, 1])
      expect(() => validateVote(value)).not.toThrow();
    for (const value of [null, '1', 2, NaN])
      expect(() => validateVote(value)).toThrow();
  });
  it('deduplicates appended comment pages', () => {
    const a = { id: 'a' } as Comment,
      b = { id: 'b' } as Comment;
    expect(appendComments([a], [a, b])).toEqual([a, b]);
  });
  it('requires verified authentication and same-origin mutations', async () => {
    for (const opts of [{ user: false }, { origin: 'https://evil.test' }]) {
      const x = event({ action: 'vote', value: 1 }, opts);
      await expect(POST(x.event)).rejects.toMatchObject({
        status: opts.user === false ? 401 : 403,
      });
      expect(x.rpc).not.toHaveBeenCalled();
    }
  });
  it('binds mutations to the authenticated SDK, never a supplied owner identifier', async () => {
    const x = event({ action: 'vote', value: 1, user_id: 'forged' });
    expect((await POST(x.event)).status).toBe(200);
    expect(x.rpc).toHaveBeenCalledWith('vote_case', { p_case: id, p_value: 1 });
    const c = event({
      action: 'comment',
      id,
      body: 'Thoughtful comment',
      parent: null,
    });
    await POST(c.event);
    expect(c.rpc).toHaveBeenCalledWith('post_case_comment', {
      p_case: id,
      p_id: id,
      p_body: 'Thoughtful comment',
      p_parent: null,
    });
  });
  it('rejects malformed comments, votes and pagination before database calls', async () => {
    for (const body of [
      { action: 'vote', value: 2 },
      { action: 'comment', body: ' ', id, parent: null },
      { action: 'comment', body: 'text', id, parent: 'invalid' },
      { action: 'delete', id: 'invalid' },
      { action: 'unexpected' },
    ]) {
      const x = event(body);
      await expect(POST(x.event)).rejects.toMatchObject({ status: 400 });
      expect(x.rpc).not.toHaveBeenCalled();
    }
    const x = event({}, { query: '?view=comments&cursor=invalid&time=bad' });
    await expect(
      GET(x.event as Parameters<typeof GET>[0]),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('bounds streamed comment requests before database writes', async () => {
    const x = event({
      action: 'comment',
      id,
      body: 'x'.repeat(17000),
      parent: null,
    });
    await expect(POST(x.event)).rejects.toMatchObject({ status: 413 });
    expect(x.rpc).not.toHaveBeenCalled();
  });
  it('returns actionable errors while leaving ownership enforcement to the RPC', async () => {
    const x = event({ action: 'delete', id });
    x.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } });
    await expect(POST(x.event)).rejects.toMatchObject({ status: 403 });
  });
});
