import { DATABASE_URL, OPENROUTER_API_KEY } from '$app/env/private';
import { error, json, isHttpError } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/admin.js';
import { publishTopics } from '#lib/server/topic-synthesis.js';
import { TopicError } from '../../../../../scripts/topic-model.ts';
import type { RequestHandler } from './$types';

// The shared pipeline can make several serial free-model requests.
export const config = { maxDuration: 300 };
export const POST: RequestHandler = async (event) => {
  await requireAdmin(event);
  if (event.request.headers.get('origin') !== event.url.origin)
    error(403, 'Invalid request origin.');
  if ((await event.request.text()).trim())
    error(
      400,
      'Synthesis uses the current database issues; no request data is accepted.',
    );
  try {
    const result = await publishTopics(
      {
        databaseUrl: DATABASE_URL,
        apiKey: OPENROUTER_API_KEY,
      },
      () => requireAdmin(event),
    );
    return json(result);
  } catch (failure) {
    // Never serialize provider bodies, issue content, DSNs or arbitrary exception messages.
    if (failure instanceof TopicError)
      return json(
        { message: failure.message },
        { status: failure.message.includes('already in progress') ? 409 : 400 },
      );
    // Preserve the framework's fresh authorization errors at the publication boundary.
    if (isHttpError(failure)) throw failure;
    return json(
      {
        message:
          'Synthesis could not complete. Check the server database connection and migrations. Previous topics were preserved.',
      },
      { status: 503 },
    );
  }
};
