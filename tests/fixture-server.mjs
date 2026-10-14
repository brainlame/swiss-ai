// @ts-nocheck
// Loopback-only SDK test adapter. PostgreSQL/RLS are real; Auth and file transport are fixtures.
import http from 'node:http';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
const database = process.env.TEST_DATABASE_URL;
if (
  !database ||
  !['127.0.0.1', 'localhost'].includes(new URL(database).hostname)
)
  throw new Error(
    'Set TEST_DATABASE_URL to an isolated loopback PostgreSQL database.',
  );
const pool = new pg.Pool({ connectionString: database });
const users = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'citizen@fixtures.invalid',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'other@fixtures.invalid',
  },
].map((u) => ({
  ...u,
  aud: 'authenticated',
  role: 'authenticated',
  created_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: {},
}));
const files = new Map();
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  'base64',
);
const token = (u) =>
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
    'base64url',
  ) +
  '.' +
  Buffer.from(
    JSON.stringify({
      sub: u.id,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url') +
  '.fixture';
function user(req) {
  try {
    const value = req.headers.authorization?.replace('Bearer ', '');
    if (!value?.endsWith('.fixture')) return null;
    const claim = JSON.parse(Buffer.from(value.split('.')[1], 'base64url'));
    return users.find((u) => u.id === claim.sub) ?? null;
  } catch {
    return null;
  }
}
function session(u) {
  return {
    access_token: token(u),
    refresh_token: 'fixture-' + u.id,
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: u,
  };
}
async function seed() {
  const db = await pool.connect();
  try {
    await db.query('begin');
    await db.query(
      'delete from public.cases where id in(select case_id from private.case_owners where user_id=any($1::uuid[]))',
      [users.map((u) => u.id)],
    );
    await db.query("delete from storage.objects where bucket_id='screenshots'");
    for (const u of users)
      await db.query(
        'insert into auth.users(id,email) values($1,$2) on conflict(id) do nothing',
        [u.id, u.email],
      );
    files.clear();
    for (let i = 0; i < 26; i++) {
      const id = 'eeeeeeee-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
        path = id + '/' + randomUUID() + '.png';
      await db.query(
        "insert into public.cases(id,constitution_number,description,improvement,status,created_at,version) values($1,$2,$3,$4,'published',$5,2)",
        [
          id,
          (i % 11) + 1,
          i === 0
            ? 'The chatbot admitted uncertainty and explained how to verify its answer.'
            : 'Fixture citizen perspective ' + i,
          i === 0
            ? 'Add a commitment to explain uncertainty and verification.'
            : 'Offer clear explanations for everyday questions.',
          new Date(Date.UTC(2026, 0, 26 - i)).toISOString(),
        ],
      );
      await db.query('insert into private.case_owners values($1,$2)', [
        id,
        users[0].id,
      ]);
      await db.query(
        "insert into private.uploads(path,case_id,mime_type,byte_size) values($1,$2,'image/png',$3)",
        [path, id, png.length],
      );
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('screenshots',$1,$2)",
        [path, JSON.stringify({ size: png.length, mimetype: 'image/png' })],
      );
      await db.query(
        'insert into public.case_screenshots(case_id,storage_path,display_order) values($1,$2,0)',
        [id, path],
      );
      files.set(path, { bytes: png, mime: 'image/png' });
    }
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  } finally {
    db.release();
  }
}
await seed();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:54331'),
    path = decodeURIComponent(url.pathname);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  let body = {};
  if (req.headers['content-type']?.includes('application/json') && bytes.length)
    body = JSON.parse(bytes.toString());
  const send = (status, data) => {
    res.writeHead(status, {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(data));
  };
  if (path === '/__test/reset') {
    try {
      await seed();
      send(200, { ok: true });
    } catch (e) {
      send(500, { message: e.message });
    }
    return;
  }
  if (path === '/health') {
    send(200, { ok: true });
    return;
  }
  if (path.startsWith('/auth/v1/')) {
    const u = user(req);
    if (path.endsWith('/token')) {
      const found = users.find((u) => u.email === body.email);
      if (found && body.password === 'fixturepass123')
        send(200, session(found));
      else if (body.refresh_token?.startsWith('fixture-'))
        send(
          200,
          session(
            users.find((u) => body.refresh_token === 'fixture-' + u.id) ||
              users[0],
          ),
        );
      else send(400, { msg: 'Invalid credentials' });
    } else if (path.endsWith('/user')) {
      if (u) send(200, u);
      else send(401, { msg: 'Not authenticated' });
    } else if (path.endsWith('/logout')) {
      res.writeHead(204);
      res.end();
    } else if (path.endsWith('/recover')) send(200, {});
    else if (path.endsWith('/signup')) send(200, { user: users[0] });
    else send(400, { msg: 'Fixture auth route unsupported' });
    return;
  }
  const db = await pool.connect();
  let committed = false;
  try {
    await db.query('begin');
    const u = user(req);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      u?.id ?? '',
    ]);
    await db.query('set local role ' + (u ? 'authenticated' : 'anon'));
    let data;
    if (path.startsWith('/rest/v1/rpc/')) {
      const name = path.split('/').pop();
      const allowed = [
        'owns_case',
        'begin_case',
        'reserve_upload',
        'commit_case',
        'pending_paths',
        'begin_delete',
        'finish_delete',
        'prune_uploads',
        'browse_cases',
      ];
      if (!allowed.includes(name)) throw new Error('RPC is not available');
      const keys = Object.keys(body);
      if (keys.some((k) => !/^p_[a-z_]+$/.test(k)))
        throw new Error('Invalid parameter');
      const sql =
        'select * from public.' +
        name +
        '(' +
        keys.map((k, i) => k + '=>$' + (i + 1)).join(',') +
        ')';
      const rows = (await db.query(sql, Object.values(body))).rows;
      data =
        name === 'browse_cases'
          ? rows
          : ['pending_paths', 'begin_delete'].includes(name)
            ? rows.map((r) => r[name])
            : (rows[0]?.[name] ?? null);
    } else if (path.startsWith('/rest/v1/')) {
      const table = path.split('/').pop();
      if (!['constitutions', 'cases', 'case_screenshots'].includes(table))
        throw new Error('Table is private');
      let sql = 'select * from public.' + table;
      const params = [];
      const conditions = [];
      for (const key of ['id', 'case_id']) {
        const v = url.searchParams.get(key);
        if (v?.startsWith('eq.')) {
          params.push(v.slice(3));
          conditions.push(key + '=$' + params.length);
        } else if (v?.startsWith('in.(')) {
          params.push(v.slice(4, -1).split(','));
          conditions.push(key + '=any($' + params.length + '::uuid[])');
        }
      }
      if (conditions.length) sql += ' where ' + conditions.join(' and ');
      sql +=
        ' order by ' +
        (table === 'constitutions'
          ? 'number'
          : table === 'case_screenshots'
            ? 'display_order'
            : 'created_at');
      data = (await db.query(sql, params)).rows;
      if (req.headers.accept?.includes('vnd.pgrst.object'))
        data = data[0] ?? null;
    } else if (
      path.startsWith('/storage/v1/object/sign/screenshots') &&
      req.method === 'POST'
    ) {
      data = [];
      for (const p of body.paths) {
        const { rows } = await db.query(
          "select name from storage.objects where bucket_id='screenshots' and name=$1",
          [p],
        );
        data.push(
          rows.length
            ? {
                path: p,
                signedURL: '/object/sign/screenshots/' + p + '?token=fixture',
                error: null,
              }
            : { path: p, error: 'Not authorized' },
        );
      }
    } else if (
      path.startsWith('/storage/v1/object/sign/screenshots/') &&
      req.method === 'GET'
    ) {
      const p = path.slice('/storage/v1/object/sign/screenshots/'.length);
      const file = files.get(p);
      await db.query('commit');
      committed = true;
      if (!file) {
        send(404, { message: 'Image not found' });
        return;
      }
      res.writeHead(200, { 'content-type': file.mime });
      res.end(file.bytes);
      return;
    } else if (
      path.startsWith('/storage/v1/object/screenshots/') &&
      req.method === 'POST'
    ) {
      const p = path.slice('/storage/v1/object/screenshots/'.length),
        mime = req.headers['content-type'];
      if (
        !['image/png', 'image/jpeg', 'image/webp'].includes(mime) ||
        bytes.length > 10485760
      )
        throw new Error('Invalid upload');
      await db.query(
        "insert into storage.objects(bucket_id,name,metadata) values('screenshots',$1,$2)",
        [p, JSON.stringify({ size: bytes.length, mimetype: mime })],
      );
      files.set(p, { bytes, mime });
      data = { Key: 'screenshots/' + p, Id: randomUUID() };
    } else if (
      path === '/storage/v1/object/screenshots' &&
      req.method === 'DELETE'
    ) {
      data = [];
      for (const p of body.prefixes ?? []) {
        const { rows } = await db.query(
          "delete from storage.objects where bucket_id='screenshots' and name=$1 returning id,name",
          [p],
        );
        if (rows.length) {
          files.delete(p);
          data.push(...rows);
        }
      }
    } else throw new Error('Fixture route unsupported: ' + path);
    await db.query('commit');
    committed = true;
    send(200, data);
  } catch (e) {
    if (!committed) await db.query('rollback');
    send(400, {
      message: e.message,
      code: e.code ?? 'FIXTURE_ERROR',
      details: null,
      hint: null,
    });
  } finally {
    db.release();
  }
});
server.listen(54331, '127.0.0.1', () =>
  process.stdout.write(
    'Isolated SDK fixture adapter: http://127.0.0.1:54331\n',
  ),
);
process.on('SIGTERM', () => {
  server.close();
  pool.end();
});
