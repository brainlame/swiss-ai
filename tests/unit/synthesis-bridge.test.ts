import { beforeEach, describe, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  quota: vi.fn(),
  synthesize: vi.fn(),
  classifier: vi.fn(),
}));
vi.mock('pg', () => ({
  default: {
    Client: class {
      connect = deps.connect;
      end = deps.end;
    },
  },
}));
vi.mock('../../scripts/topic-synthesis.ts', () => ({
  synthesize: deps.synthesize,
}));
vi.mock('../../scripts/topic-model.ts', async (original) => ({
  ...(await original<typeof import('../../scripts/topic-model.ts')>()),
  checkOpenRouterQuota: deps.quota,
  openRouter: () => deps.classifier,
}));
import { publishTopics } from '#lib/server/topic-synthesis.js';
beforeEach(() => {
  for (const fn of Object.values(deps)) fn.mockReset();
});
describe('website synthesis bridge', () => {
  it('uses the shared CLI engine, quota check and publication guard', async () => {
    deps.synthesize.mockResolvedValue({ topics: 1, issues: 2, revision: '3' });
    const guard = vi.fn();
    const manifest = [{ approved: true }];
    expect(
      await publishTopics(
        manifest,
        { databaseUrl: 'synthetic', apiKey: 'synthetic' },
        guard,
      ),
    ).toEqual({ topics: 1, issues: 2, revision: '3' });
    expect(deps.quota).toHaveBeenCalledWith('synthetic');
    expect(deps.synthesize).toHaveBeenCalledWith(
      expect.anything(),
      manifest,
      deps.classifier,
      guard,
    );
    expect(deps.end).toHaveBeenCalledOnce();
  });
  it('closes the database connection on provider failure', async () => {
    deps.quota.mockRejectedValue(new Error('Quota unavailable'));
    await expect(
      publishTopics(
        [],
        { databaseUrl: 'synthetic', apiKey: 'synthetic' },
        async () => {},
      ),
    ).rejects.toThrow('Quota unavailable');
    expect(deps.end).toHaveBeenCalledOnce();
    expect(deps.synthesize).not.toHaveBeenCalled();
  });
  it('reports missing configuration without connecting or calling the model', async () => {
    await expect(publishTopics([], {}, async () => {})).rejects.toThrow(
      'Configure server-only',
    );
    expect(deps.connect).not.toHaveBeenCalled();
    expect(deps.quota).not.toHaveBeenCalled();
  });
});
