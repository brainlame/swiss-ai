export const load = ({ locals }: { locals: App.Locals }) => ({
  signedIn: !!locals.user,
});
