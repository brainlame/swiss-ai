import { describe, expect, it, vi } from 'vitest';
import { POST } from '../../src/routes/api/save/+server';
import { selectReply } from '../../src/lib/chatbot';

const id = 'aaaaaaaa-0000-4000-8000-000000000001';
const exchange = { prompt: 'hello', response: selectReply('hello').text };
function setup(
  body: Record<string, unknown>,
  stored: typeof exchange | null = null,
) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === 'begin_case' ? id : name === 'pending_paths' ? [] : null,
    error: null,
  }));
  const from = vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() =>
        table === 'cases'
          ? {
              maybeSingle: async () => ({
                data: {
                  chat_prompt: stored?.prompt ?? null,
                  chat_response: stored?.response ?? null,
                },
                error: null,
              }),
            }
          : Promise.resolve({ data: [], error: null }),
      ),
    })),
  }));
  const event = {
    url: new URL('https://app.example/api/save'),
    request: new Request('https://app.example/api/save', {
      method: 'POST',
      headers: {
        origin: 'https://app.example',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id,
        description: 'A case',
        improvement: 'A proposal',
        constitution: 2,
        version: 1,
        ...body,
      }),
    }),
    locals: { user: { id: 'owner' }, supabase: { rpc, from } },
  } as unknown as Parameters<typeof POST>[0];
  return { event, rpc, from };
}

describe('trusted case evidence boundaries', () => {
  it('validates a selected response before beginning a case', async () => {
    const { event, rpc } = setup({ stage: 'begin', exchange });
    expect((await POST(event)).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'begin_case',
      expect.objectContaining({
        p_chat_prompt: exchange.prompt,
        p_chat_response: exchange.response,
      }),
    );
  });
  it('rejects fabricated and incomplete exchanges before database writes', async () => {
    for (const value of [
      { prompt: 'hello', response: 'fabricated' },
      { prompt: 'hello' },
      { prompt: '', response: '' },
    ]) {
      const { event, rpc } = setup({ stage: 'begin', exchange: value });
      await expect(POST(event)).rejects.toMatchObject({ status: 400 });
      expect(rpc).not.toHaveBeenCalled();
    }
  });
  it('rejects missing screenshots for ordinary cases using the saved evidence state', async () => {
    for (const value of [null, exchange]) {
      const { event, rpc } = setup({
        stage: 'commit',
        paths: [],
        exchange: value,
      });
      await expect(POST(event)).rejects.toMatchObject({ status: 400 });
      expect(rpc).not.toHaveBeenCalledWith('commit_case', expect.anything());
    }
  });
  it('saves chat-only cases without image uploads', async () => {
    const { event, rpc } = setup(
      { stage: 'commit', paths: [], exchange },
      exchange,
    );
    const result = await POST(event);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ id, cleanupWarning: false });
    expect(rpc).toHaveBeenCalledWith(
      'commit_case',
      expect.objectContaining({ p_paths: [] }),
    );
  });
  it('prevents changing or removing saved evidence during editing', async () => {
    for (const value of [
      null,
      { prompt: 'changed', response: exchange.response },
      { prompt: exchange.prompt, response: 'changed' },
    ]) {
      const { event, rpc } = setup(
        { stage: 'commit', paths: [], exchange: value },
        exchange,
      );
      await expect(POST(event)).rejects.toMatchObject({
        status: 400,
        body: { message: expect.stringContaining('read-only') },
      });
      expect(rpc).not.toHaveBeenCalledWith('commit_case', expect.anything());
    }
  });
  it('rejects invalid stages and screenshot lists', async () => {
    for (const body of [
      { stage: 'unexpected' },
      { stage: 'commit', paths: null },
      { stage: 'commit', paths: [null] },
      { stage: 'commit', paths: Array(6).fill('image') },
    ]) {
      const { event, rpc } = setup({ ...body, exchange }, exchange);
      await expect(POST(event)).rejects.toMatchObject({ status: 400 });
      expect(rpc).not.toHaveBeenCalledWith('commit_case', expect.anything());
    }
  });
});
