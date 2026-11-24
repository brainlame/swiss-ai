import { describe, expect, it, vi } from 'vitest';
import {
  approvedInputs,
  checkOpenRouterQuota,
  classify,
  openRouter,
  validateClassification,
  MODEL,
} from '../../scripts/topic-model.ts';

function grouped(entries: { ref: string }[]) {
  return {
    topics: [{ id: 't1', name: 'Source verification' }],
    assignments: entries.map(({ ref }) => ({ ref, topic: 't1' })),
  };
}

describe('topic classification', () => {
  it('sends only approved substantive fields and temporary refs to the exact free model', async () => {
    const issue = {
      id: 'database-id',
      fingerprint: 'source-hash',
      behavior: 'bad' as const,
    };
    const approval = {
      issueId: issue.id,
      fingerprint: issue.fingerprint,
      approved: true,
      description: 'The assistant invented a source.',
      improvement: 'Ask for verifiable citations.',
      principle: 'Be truthful about the evidence.',
      evidence: 'A fictional assistant gave a citation it had not checked.',
      account: 'private@example.invalid',
    };
    const inputs = approvedInputs([issue], [approval]);
    const fetcher = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(grouped(inputs)) },
          },
        ],
      }),
    );
    expect(await classify(inputs, openRouter('test-key', fetcher))).toEqual({
      topics: [{ id: 'source-verification', name: 'Source verification' }],
      assignments: [{ ref: 'i1', topic: 'source-verification' }],
    });
    const [url, request] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(request).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key' },
    });
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({
      model: MODEL,
      stream: false,
      provider: { allow_fallbacks: false },
    });
    expect(body).not.toHaveProperty('response_format');
    expect(body.messages[0].content).toContain(
      'Assume there are no predefined topics.',
    );
    expect(body.messages[0].content).toContain('one to three words');
    expect(body.messages[0].content).toContain('broad, understandable topics');
    expect(body.messages[1].content).toContain(approval.evidence);
    expect(body.messages[1].content).not.toMatch(
      /database-id|source-hash|private@example/,
    );
    expect(() =>
      approvedInputs([issue], [{ ...approval, fingerprint: 'stale' }]),
    ).toThrow('changed');
    expect(() =>
      approvedInputs(
        [issue],
        [{ ...approval, evidence: 'email private@example.invalid' }],
      ),
    ).toThrow('sanitized');
    expect(() => approvedInputs([issue], [])).toThrow('cover every');
  });

  it('rejects partial, duplicate, unknown and unusable results', () => {
    const valid = grouped([{ ref: 'i1' }, { ref: 'i2' }]);
    for (const assignments of [
      valid.assignments.slice(0, 1),
      [valid.assignments[0], valid.assignments[0]],
      [valid.assignments[0], { ref: 'i3', topic: 't1' }],
      [valid.assignments[0], { ref: 'i2', topic: 't2' }],
    ])
      expect(() =>
        validateClassification({ ...valid, assignments }, ['i1', 'i2']),
      ).toThrow();
    expect(() =>
      validateClassification(
        { ...valid, topics: [{ id: 't1', name: 'Other' }] },
        ['i1', 'i2'],
      ),
    ).toThrow();
  });

  it('accepts broad one-to-three-word labels and rejects longer labels', () => {
    for (const name of [
      'AI',
      'Privacy',
      'Safety',
      'Using context',
      'Personal data protection',
    ]) {
      expect(() =>
        validateClassification(
          {
            topics: [{ id: 't1', name }],
            assignments: [{ ref: 'i1', topic: 't1' }],
          },
          ['i1'],
        ),
      ).not.toThrow();
    }
    expect(() =>
      validateClassification(
        {
          topics: [{ id: 't1', name: 'Handling private personal information' }],
          assignments: [{ ref: 'i1', topic: 't1' }],
        },
        ['i1'],
      ),
    ).toThrow('one to three words');
  });

  it('reconciles related groups across input batches without sending model-written labels', async () => {
    const entries = Array.from({ length: 17 }, (_, i) => ({
      ref: `i${i + 1}`,
      description: 'Citation concern.',
      evidence: 'Approved synthetic transcript.',
    }));
    const request = vi.fn(
      async (batch: { ref: string }[], reconcile?: boolean) => {
        if (reconcile) {
          expect(JSON.stringify(batch)).not.toContain('Provisional label');
          expect(JSON.stringify(batch)).not.toContain('synthetic transcript');
        } else {
          expect(JSON.stringify(batch)).toContain('synthetic transcript');
        }
        expect(batch.length).toBeLessThanOrEqual(8);
        const result = grouped(batch);
        if (!reconcile) result.topics[0].name = 'Provisional label';
        return result;
      },
    );
    const result = await classify(entries, request);
    expect(request).toHaveBeenCalledTimes(4);
    expect(result.topics).toEqual([
      { id: 'source-verification', name: 'Source verification' },
    ]);
    expect(result.assignments).toHaveLength(17);
    expect(new Set(result.assignments.map((item) => item.topic))).toEqual(
      new Set(['source-verification']),
    );
  });

  it('retries invalid labels with safe corrective feedback and normalizes valid names', async () => {
    const inputs = [{ ref: 'i1' }];
    const completion = (name: string) =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                topics: [{ id: 't1', name }],
                assignments: [{ ref: 'i1', topic: 't1' }],
              }),
            },
          },
        ],
      });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        completion('Handling private personal information'),
      )
      .mockResolvedValueOnce(completion('  Using   context  '));
    await expect(
      classify(
        inputs,
        openRouter('test-key', fetcher, async () => {}),
      ),
    ).resolves.toEqual({
      topics: [{ id: 'using-context', name: 'Using context' }],
      assignments: [{ ref: 'i1', topic: 'using-context' }],
    });
    const retry = JSON.parse(fetcher.mock.calls[1][1]!.body as string);
    expect(retry.messages[0].content).toContain(
      'The previous attempt failed validation.',
    );
    expect(retry.messages[0].content).toContain('one to three words');
    expect(JSON.stringify(retry)).not.toContain(
      'Handling private personal information',
    );
  });

  it('bounds invalid-classification retries and keeps rejecting incomplete assignments', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({
                topics: [{ id: 't1', name: 'Privacy' }],
                assignments: [],
              }),
            },
          },
        ],
      }),
    );
    await expect(
      openRouter('test-key', fetcher, async () => {})([{ ref: 'i1' }]),
    ).rejects.toThrow('Failed classification after three attempts');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('retries a dropped response body and never accepts its partial contents', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('private incomplete response'),
              );
              controller.error(new TypeError('terminated'));
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(grouped([{ ref: 'i1' }])) },
            },
          ],
        }),
      );
    const pause = vi.fn(async () => {});
    await expect(
      classify([{ ref: 'i1' }], openRouter('test-key', fetcher, pause)),
    ).resolves.toMatchObject({
      assignments: [{ ref: 'i1', topic: 'source-verification' }],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('distinguishes response timeouts without waiting for the real deadline', async () => {
    const signal = AbortSignal.abort(
      new DOMException('Timed out', 'TimeoutError'),
    );
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(signal.reason);
            },
          }),
        ),
    );
    try {
      await expect(
        openRouter('test-key', fetcher, async () => {})([{ ref: 'i1' }]),
      ).rejects.toThrow('did not finish its response within 180 seconds');
      expect(timeout).toHaveBeenCalledWith(180000);
      expect(fetcher).toHaveBeenCalledTimes(3);
    } finally {
      timeout.mockRestore();
    }
  });

  it('reports exhausted daily quota using only safe counts', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        data: {
          label: 'private-key-label',
          free_model_daily_requests: { used: 51, limit: 50, remaining: 0 },
        },
      }),
    );
    await expect(checkOpenRouterQuota('test-key', fetcher)).rejects.toThrow(
      /daily free-model quota exhausted.*51\/50.*0 remaining.*next UTC midnight/,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('honors a 60-second retry hint and retries only the rejected batch', async () => {
    let requests = 0;
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      if (String(url).endsWith('/key'))
        return Response.json({
          data: {
            free_model_daily_requests: { used: 1, limit: 50, remaining: 49 },
          },
        });
      requests++;
      if (requests === 1)
        return new Response('', {
          status: 429,
          headers: { 'retry-after': '60' },
        });
      return Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify(grouped([{ ref: 'i1' }])),
            },
          },
        ],
      });
    });
    const pause = vi.fn(async (_ms: number) => {});
    await expect(
      classify([{ ref: 'i1' }], openRouter('test-key', fetcher, pause)),
    ).resolves.toMatchObject({
      assignments: [{ ref: 'i1', topic: 'source-verification' }],
    });
    expect(pause).toHaveBeenCalledWith(60000);
    expect(requests).toBe(2);
  });

  it('stops immediately on daily exhaustion and reports long retry hints without retrying early', async () => {
    const daily = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/key')
        ? Response.json({
            data: {
              free_model_daily_requests: { used: 50, limit: 50, remaining: 0 },
            },
          })
        : new Response('', { status: 429 }),
    );
    const pause = vi.fn(async (_ms: number) => {});
    await expect(
      openRouter('test-key', daily, pause)([{ ref: 'i1' }]),
    ).rejects.toThrow('daily free-model quota exhausted');
    expect(daily).toHaveBeenCalledTimes(2);
    expect(pause).not.toHaveBeenCalled();
    const longWait = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/key')
        ? Response.json({ data: {} })
        : new Response('', { status: 429, headers: { 'retry-after': '3600' } }),
    );
    await expect(
      openRouter('test-key', longWait, pause)([{ ref: 'i1' }]),
    ).rejects.toThrow('at least 3600 seconds');
    expect(longWait).toHaveBeenCalledTimes(2);
    expect(pause).not.toHaveBeenCalled();
  });

  it('bounds free-provider retries', async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) =>
      String(url).endsWith('/key')
        ? Response.json({
            data: {
              free_model_daily_requests: { used: 1, limit: 50, remaining: 49 },
            },
          })
        : new Response('', { status: 429 }),
    );
    const pause = vi.fn(async () => {});
    await expect(
      openRouter('test-key', fetcher, pause)([{ ref: 'i1' }]),
    ).rejects.toThrow('HTTP 429');
    expect(fetcher).toHaveBeenCalledTimes(6); // Three model attempts and three quota checks.
    expect(pause.mock.calls).toEqual([[15000], [30000]]);
  });

  it('validates a complete response when the provider omits the finish reason', async () => {
    const entries = [{ ref: 'i1' }];
    const fetcher = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(grouped(entries)) } }],
      }),
    );
    await expect(
      classify(entries, openRouter('test-key', fetcher)),
    ).resolves.toMatchObject({
      assignments: [{ ref: 'i1', topic: 'source-verification' }],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    [' ', 'an empty response body'],
    ['private gateway response', 'a response body that was not valid JSON'],
    ['{"data":[]}', 'JSON without a completion choice'],
  ])(
    'distinguishes invalid response bodies without logging them',
    async (body, expected) => {
      const fetcher = vi.fn(async () => new Response(body));
      await expect(
        openRouter('test-key', fetcher, async () => {})([{ ref: 'g1' }], true),
      ).rejects.toThrow(
        `OpenRouter returned ${expected}. Failed reconciliation after three attempts (1 entries).`,
      );
    },
  );

  it('retries truncated and malformed output before accepting a complete answer', async () => {
    const entries = [{ ref: 'i1' }];
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ choices: [{ finish_reason: 'length' }] }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ finish_reason: 'stop', message: { content: '{' } }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: { content: JSON.stringify(grouped(entries)) },
            },
          ],
        }),
      );

    await expect(
      classify(
        entries,
        openRouter('test-key', fetcher, async () => {}),
      ),
    ).resolves.toMatchObject({
      assignments: [{ ref: 'i1', topic: 'source-verification' }],
    });
    expect(
      fetcher.mock.calls.map(
        ([, init]) => JSON.parse(init?.body as string).max_tokens,
      ),
    ).toEqual([8192, 16384, 16384]);
  });

  it('reports an exhausted retry without including provider content', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        choices: [
          { finish_reason: 'stop', message: { content: 'private raw output' } },
        ],
      }),
    );
    await expect(
      openRouter('test-key', fetcher, async () => {})([{ ref: 'g1' }], true),
    ).rejects.toThrow(
      /^OpenRouter returned malformed classification JSON\. Failed reconciliation after three attempts \(1 entries\)\.$/,
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
