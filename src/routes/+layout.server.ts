import { myProfile } from '#lib/server/profiles.js';
import { createHash } from 'node:crypto';
import { takeTutorial } from '#lib/server/tutorial.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => ({
  profile: event.locals.user ? await myProfile(event.locals.supabase) : null,
  accountEmail: event.locals.user?.email ?? null,
  signedIn: !!event.locals.user,
  tutorialAccount: event.locals.user
    ? createHash('sha256')
        .update('tutorial:' + event.locals.user.id)
        .digest('hex')
    : null,
  startTutorial: takeTutorial(event),
});
