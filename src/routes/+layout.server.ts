import { createHash } from 'node:crypto';
import { takeTutorial } from '#lib/server/tutorial.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = (event) => ({
  signedIn: !!event.locals.user,
  tutorialAccount: event.locals.user
    ? createHash('sha256')
        .update('tutorial:' + event.locals.user.id)
        .digest('hex')
    : null,
  startTutorial: takeTutorial(event),
});
