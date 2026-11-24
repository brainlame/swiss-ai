import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  prepareReview,
  readSnapshot,
  synthesize,
} from '../../scripts/synthesize-topics.ts';
import { automaticManifest } from '../../scripts/topic-automatic.ts';
import { openRouter } from '../../scripts/topic-model.ts';

describe.skipIf(!process.env.TEST_TOPIC_DATABASE_URL)(
  'atomic topic synthesis',
  () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_TOPIC_DATABASE_URL,
    });
    const other = new pg.Client({
      connectionString: process.env.TEST_TOPIC_DATABASE_URL,
    });
    const ids: string[] = Array.from({ length: 26 }, () => randomUUID());
    const newcomer = randomUUID();
    let ready = false;

    beforeAll(async () => {
      await db.connect();
      await other.connect();
      const { rows } = await db.query(`select exists(select 1 from public.cases)
      or exists(select 1 from public.issue_topics) as occupied`);
      if (rows[0].occupied)
        throw new Error('Topic tests require a fresh disposable database.');
      ready = true;
      await db.query(
        `insert into public.cases(id, constitution_number, description, improvement, status, behavior, transcript)
      select id, case when n <= 24 then 2 else null end,
        case when n <= 22 then 'Citation supplied'
             when n <= 24 then 'Missing attribution'
             else 'Citation exposes a private address' end,
        'Review the behavior', 'published', 'bad', $2::jsonb
      from unnest($1::uuid[]) with ordinality as u(id, n)`,
        [
          ids,
          JSON.stringify([
            {
              role: 'user',
              text: 'Private raw transcript: example@example.invalid',
            },
            { role: 'assistant', text: 'Raw evidence' },
          ]),
        ],
      );
    });

    afterAll(async () => {
      try {
        if (ready) {
          await db.query(
            'delete from public.cases where id = any($1::uuid[])',
            [[...ids, newcomer]],
          );
          await db.query(
            "delete from public.issue_topics where id in ('source-verification', 'personal-privacy', 'old-catalog')",
          );
        }
      } finally {
        await Promise.all([db.end(), other.end()]);
      }
    });

    async function approvals() {
      return (await readSnapshot(db)).map((issue) => ({
        issueId: issue.id,
        fingerprint: issue.fingerprint,
        approved: true,
        description:
          ids.indexOf(issue.id) < 24
            ? 'An unverified source was cited.'
            : 'Private details were exposed.',
        improvement: 'Review the evidence before answering.',
        principle: 'Give truthful and privacy-conscious answers.',
      }));
    }

    it('publishes related issues together and combines topic, principle, search and ranked pagination', async () => {
      const initial = (
        await db.query('select public.browse_ranked_issues() as feed')
      ).rows[0].feed;
      expect(initial.topics).toEqual([]);
      expect(initial.has_unclassified).toBe(true);
      const review = await prepareReview(db);
      expect(review).toHaveLength(26);
      expect(review.find((entry) => entry.issueId === ids[0])).toMatchObject({
        approved: false,
        description: 'Citation supplied',
        improvement: 'Review the behavior',
        principle: expect.any(String),
        behavior: 'bad',
      });
      expect(
        review.map(({ issueId, fingerprint }) => ({
          id: issueId,
          fingerprint,
        })),
      ).toEqual(
        (await readSnapshot(db)).map(({ id, fingerprint }) => ({
          id,
          fingerprint,
        })),
      );
      await db.query(`
        insert into public.issue_topics(id,name) values('old-catalog','Previous catalog sentinel');
        insert into public.issue_topic_assignments(issue_id,topic_id)
          select id,'old-catalog' from public.cases limit 1;
      `);

      const fetcher: typeof fetch = vi.fn(async (_url, init) => {
        const { messages } = JSON.parse(init?.body as string);
        expect(init?.body).not.toMatch(/old-catalog|Previous catalog sentinel/);
        const entries = JSON.parse(messages[1].content) as {
          ref: string;
          description?: string;
          examples?: { description: string }[];
        }[];
        const assignments = entries.map(({ ref, description, examples }) => ({
          ref,
          topic: (description ?? examples?.[0]?.description ?? '').startsWith(
            'Private',
          )
            ? 't2'
            : 't1',
        }));
        return Response.json({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  topics: [
                    { id: 't1', name: 'Source verification' },
                    { id: 't2', name: 'Personal privacy' },
                  ].filter((topic) =>
                    assignments.some((a) => a.topic === topic.id),
                  ),
                  assignments,
                }),
              },
            },
          ],
        });
      });
      const published = await synthesize(
        db,
        await approvals(),
        openRouter('synthetic-key', fetcher),
      );
      expect(published).toMatchObject({ issues: 26, topics: 2 });
      expect(fetcher).toHaveBeenCalled();

      await other.query(
        "insert into public.cases(id,constitution_number,description,improvement,status) values($1,2,'Citation new','Review','published')",
        [newcomer],
      );
      await other.query('set role anon');
      try {
        const { rows } = await other.query(`select public.browse_ranked_issues(
        p_search=>'citation', p_constitution=>2, p_topic=>'source-verification') as feed`);
        const first = rows[0].feed;
        expect(first.topics.map((topic: { id: string }) => topic.id)).toEqual([
          'personal-privacy',
          'source-verification',
        ]);
        expect(first.has_unclassified).toBe(true);
        expect(first.items).toHaveLength(11);
        const seen = [];
        let feed = first;
        while (feed.items.length > 10) {
          seen.push(
            ...feed.items.slice(0, 10).map((item: { id: string }) => item.id),
          );
          const offset = feed.offset + 10;
          feed = (
            await other.query(
              `select public.browse_ranked_issues(
          p_search=>'citation',p_constitution=>2,p_topic=>'source-verification',
          p_offset=>$1,p_asof=>$2,p_revision=>$3) as feed`,
              [offset, first.asof, first.revision],
            )
          ).rows[0].feed;
        }
        seen.push(...feed.items.map((item: { id: string }) => item.id));
        expect(seen.sort()).toEqual(ids.slice(0, 22).sort());
        const unclassified = (
          await other.query(`select public.browse_ranked_issues(
        p_topic=>'unclassified',p_search=>'citation') as feed`)
        ).rows[0].feed;
        expect(
          unclassified.items.map((item: { id: string }) => item.id),
        ).toEqual([newcomer]);
        await expect(
          other.query('delete from public.issue_topics'),
        ).rejects.toMatchObject({ code: '42501' });
      } finally {
        await other.query('reset role');
      }
    });

    it('automatically reads the entire current corpus, filters identifiers, omits evidence, and fails closed on secrets', async () => {
      await db.query('update public.cases set description=$1 where id=$2', [
        'Citation supplied to citizen@example.invalid at https://example.invalid/private',
        ids[0],
      ]);
      let seen = 0;
      await synthesize(db, automaticManifest, async (entries, reconcile) => {
        if (!reconcile) {
          seen += entries.length;
          expect(JSON.stringify(entries)).not.toMatch(
            /@|https:|Raw evidence|Private raw transcript|issueId|fingerprint/,
          );
          expect(entries.every((entry) => !('evidence' in entry))).toBe(true);
        }
        return {
          topics: [{ id: 't1', name: 'Source verification' }],
          assignments: entries.map(({ ref }) => ({ ref, topic: 't1' })),
        };
      });
      expect(seen).toBe(27);
      const before = (
        await db.query(
          'select * from public.issue_topic_assignments order by issue_id',
        )
      ).rows;
      await db.query('update public.cases set description=$1 where id=$2', [
        'password: syntheticSensitiveValue',
        ids[0],
      ]);
      const request = vi.fn();
      await expect(synthesize(db, automaticManifest, request)).rejects.toThrow(
        'credentials or confidential',
      );
      expect(request).not.toHaveBeenCalled();
      expect(
        (
          await db.query(
            'select * from public.issue_topic_assignments order by issue_id',
          )
        ).rows,
      ).toEqual(before);
      await db.query('update public.cases set description=$1 where id=$2', [
        'Citation supplied',
        ids[0],
      ]);
    });

    it('preserves published rows on malformed, overlapping and stale runs', async () => {
      async function state() {
        return (
          await db.query(`select
        (select jsonb_agg(t order by id) from public.issue_topics t) as topics,
        (select jsonb_agg(a order by issue_id) from public.issue_topic_assignments a) as assignments`)
        ).rows[0];
      }
      const original = await state();
      const deniedPublication = vi.fn(async () => {
        throw new Error('Admin access revoked');
      });
      await expect(
        synthesize(
          db,
          await approvals(),
          async (entries) => ({
            topics: [{ id: 't1', name: 'Privacy' }],
            assignments: entries.map(({ ref }) => ({ ref, topic: 't1' })),
          }),
          deniedPublication,
        ),
      ).rejects.toThrow('Admin access revoked');
      expect(deniedPublication).toHaveBeenCalledOnce();
      expect(await state()).toEqual(original);

      const approved = await approvals();
      await expect(
        synthesize(db, approved, async () => ({ topics: [], assignments: [] })),
      ).rejects.toThrow('invalid classification');
      expect(await state()).toEqual(original);
      await expect(
        synthesize(db, approved, async (entries) => {
          const unexpected = vi.fn();
          await expect(synthesize(other, approved, unexpected)).rejects.toThrow(
            'already in progress',
          );
          expect(unexpected).not.toHaveBeenCalled();
          await other.query(
            'update public.cases set description=$1 where id=$2',
            ['Updated citation', ids[0]],
          );
          return {
            topics: [{ id: 't1', name: 'Source verification' }],
            assignments: entries.map(({ ref }) => ({ ref, topic: 't1' })),
          };
        }),
      ).rejects.toThrow('changed during synthesis');
      expect(await state()).toEqual(original);
    });
  },
);
