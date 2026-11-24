import { describe, expect, it, vi, beforeEach } from 'vitest';
vi.mock('$app/env/private', () => ({
  DATABASE_URL: 'synthetic-database',
  OPENROUTER_API_KEY: 'synthetic-key',
}));
vi.mock('#lib/server/topic-synthesis.js', () => ({ publishTopics: vi.fn() }));
import { publishTopics } from '#lib/server/topic-synthesis.js';
import { POST } from '../../src/routes/api/admin/synthesis/+server';
import { TopicError } from '../../scripts/topic-model.ts';
function event(
  admin = true,
  signedIn = true,
  origin = 'https://app.test',
  body = '[]',
) {
  return {
    locals: {
      user: signedIn ? { id: 'test' } : null,
      supabase: {
        rpc: vi.fn().mockResolvedValue({ data: admin, error: null }),
      },
    },
    url: new URL('https://app.test/api/admin/synthesis'),
    request: new Request('https://app.test/api/admin/synthesis', {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json' },
      body,
    }),
  } as unknown as Parameters<typeof POST>[0];
}
beforeEach(() => {
  vi.mocked(publishTopics).mockReset();
});
describe('admin synthesis endpoint', () => {
  it('requires verified sign-in and current membership before doing any work', async () => {
    await expect(POST(event(false, false))).rejects.toMatchObject({
      status: 401,
    });
    await expect(POST(event(false))).rejects.toMatchObject({ status: 403 });
    expect(publishTopics).not.toHaveBeenCalled();
  });
  it('rejects forged origins, invalid JSON and oversized manifests', async () => {
    await expect(
      POST(event(true, true, 'https://evil.test')),
    ).rejects.toMatchObject({ status: 403 });
    await expect(POST(event(true, true, undefined, '{'))).rejects.toMatchObject(
      { status: 400 },
    );
    await expect(
      POST(event(true, true, undefined, ' '.repeat(500001))),
    ).rejects.toMatchObject({ status: 413 });
    expect(publishTopics).not.toHaveBeenCalled();
  });
  it('passes the reviewed file to the shared job and returns only the publication summary', async () => {
    vi.mocked(publishTopics).mockResolvedValue({
      topics: 2,
      issues: 20,
      revision: '9',
    });
    const response = await POST(event());
    expect(await response.json()).toEqual({
      topics: 2,
      issues: 20,
      revision: '9',
    });
    expect(publishTopics).toHaveBeenCalledWith(
      [],
      { databaseUrl: 'synthetic-database', apiKey: 'synthetic-key' },
      expect.any(Function),
    );
  });
  it('rechecks membership at publication and denies an admin revoked during classification', async () => {
    const e = event();
    vi.mocked(publishTopics).mockImplementation(
      async (_manifest, _config, check) => {
        vi.mocked(e.locals.supabase.rpc).mockResolvedValue({
          data: false,
          error: null,
        } as never);
        await check();
        throw new Error('Unreachable');
      },
    );
    await expect(POST(e)).rejects.toMatchObject({ status: 403 });
  });
  it('returns actionable validation and overlap failures without serializing private exceptions', async () => {
    vi.mocked(publishTopics).mockRejectedValueOnce(
      new TopicError('A topic synthesis run is already in progress.'),
    );
    expect((await POST(event())).status).toBe(409);
    vi.mocked(publishTopics).mockRejectedValueOnce(
      new TopicError(
        'Issue 1 is missing approval or has changed since review.',
      ),
    );
    const invalid = await POST(event());
    expect(invalid.status).toBe(400);
    expect(await invalid.text()).toContain('Issue 1');
    vi.mocked(publishTopics).mockRejectedValueOnce(
      new Error('private transcript and secret credentials'),
    );
    const failed = await POST(event());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toMatch(/transcript|credentials/);
  });
});
