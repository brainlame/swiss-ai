import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/routes/api/save/+server';
import { selectReply } from '../../src/lib/chatbot';
const transcript = [
  { role: 'user', text: 'hello' },
  { role: 'assistant', text: selectReply('hello').text },
];
function setup(body: Record<string, unknown>, origin = 'https://app.example') {
  const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
  return {
    rpc,
    event: {
      url: new URL('https://app.example/api/save'),
      request: new Request('https://app.example/api/save', {
        method: 'POST',
        headers: { origin, 'content-type': 'application/json' },
        body: JSON.stringify({
          id: 'aaaaaaaa-0000-4000-8000-000000000001',
          version: 1,
          description: 'Description',
          improvement: 'Proposal',
          constitution: 1,
          behavior: 'bad',
          transcript,
          ...body,
        }),
      }),
      locals: { user: { id: 'private-owner' }, supabase: { rpc } },
    } as unknown as Parameters<typeof POST>[0],
  };
}
describe('case save boundaries', () => {
  it('atomically saves all messages and classification without Storage operations', async () => {
    const { event, rpc } = setup({});
    expect((await POST(event)).status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      'save_case',
      expect.objectContaining({ p_transcript: transcript, p_behavior: 'bad' }),
    );
  });
  it('rejects invalid messages, simulated replies and fields before writes', async () => {
    for (const body of [
      { transcript: [] },
      { transcript: [transcript[0]] },
      { transcript: [transcript[0], { role: 'assistant', text: 'forged' }] },
      { behavior: null },
      { behavior: 'mixed' },
      { description: ' \t' },
      { constitution: 12 },
    ]) {
      const { event, rpc } = setup(body);
      await expect(POST(event)).rejects.toMatchObject({ status: 400 });
      expect(rpc).not.toHaveBeenCalled();
    }
  });
  it('delegates immutable historical/null evidence and ownership enforcement to SQL', async () => {
    const { event, rpc } = setup({ transcript: null });
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'The attached conversation is read-only' },
    });
    await expect(POST(event)).rejects.toMatchObject({
      status: 400,
      body: { message: expect.stringContaining('read-only') },
    });
  });
  it('rejects cross-origin and oversized bodies', async () => {
    const foreign = setup({}, 'https://evil.test');
    await expect(POST(foreign.event)).rejects.toMatchObject({ status: 403 });
    const huge = setup({ description: 'x'.repeat(512001) });
    await expect(POST(huge.event)).rejects.toMatchObject({ status: 413 });
  });
});
