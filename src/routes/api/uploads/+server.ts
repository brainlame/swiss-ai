import { error } from '@sveltejs/kit';
// Historical screenshots remain readable and are cleaned up only on case deletion.
export const POST = async () =>
  error(
    410,
    'Screenshot submissions have been retired. Start an issue from Chatbot.',
  );
