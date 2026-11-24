import 'dotenv/config';
import pg from 'pg';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { UUID } from '../src/lib/validation.ts';

export class AdminCommandError extends Error {}
export async function manageAdmins(db: pg.Client, args: string[]) {
  const [command, flag, identifier, ...extra] = args;
  if (command === 'list' && args.length === 1) {
    return {
      command,
      users: (
        await db.query(
          'select a.user_id, u.email, a.granted_at from private.admin_members a join auth.users u on u.id=a.user_id order by a.granted_at,a.user_id',
        )
      ).rows,
    };
  }
  if (
    !['grant', 'revoke'].includes(command) ||
    !['--user-id', '--email'].includes(flag) ||
    !identifier?.trim() ||
    extra.length
  )
    throw new AdminCommandError(
      'Usage: npm run admins -- list | grant|revoke --user-id UUID | grant|revoke --email EMAIL',
    );
  const value = identifier.trim();
  if (
    (flag === '--user-id' && !UUID.test(value)) ||
    (flag === '--email' &&
      (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 254))
  )
    throw new AdminCommandError('Supply a valid existing user ID or email.');
  await db.query('begin');
  try {
    const users = await db.query<{ id: string; email: string | null }>(
      flag === '--user-id'
        ? 'select id,email from auth.users where id=$1::uuid for share'
        : 'select id,email from auth.users where lower(email)=lower($1) for share',
      [value],
    );
    if (users.rows.length !== 1)
      throw new AdminCommandError(
        users.rows.length
          ? 'Email matches multiple accounts. Use a unique user ID.'
          : 'No existing account matches.',
      );
    const user = users.rows[0];
    const result = await db.query(
      command === 'grant'
        ? 'insert into private.admin_members(user_id) values($1) on conflict(user_id) do nothing'
        : 'delete from private.admin_members where user_id=$1',
      [user.id],
    );
    await db.query('commit');
    return { command, userId: user.id, changed: result.rowCount === 1 };
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
async function main() {
  if (!process.env.DATABASE_URL)
    throw new AdminCommandError(
      'Set server-only DATABASE_URL to a trusted administrative PostgreSQL connection.',
    );
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10000,
  });
  try {
    await db.connect();
    const result = await manageAdmins(db, process.argv.slice(2));
    if (result.command === 'list') {
      if (!result.users?.length) console.log('No admins designated.');
      else console.table(result.users);
    } else {
      console.log(
        result.changed
          ? `Admin access ${result.command === 'grant' ? 'granted' : 'revoked'} for ${result.userId}.`
          : `No change needed for ${result.userId}.`,
      );
    }
  } finally {
    await db.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(
      error instanceof AdminCommandError
        ? error.message
        : 'Admin command failed. Check DATABASE_URL, administrative permissions and the admin migration.',
    );
    process.exitCode = 1;
  });
}
