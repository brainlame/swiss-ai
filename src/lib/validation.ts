export const MAX_SIZE = 10 * 1024 * 1024;
export const MIMES = ['image/png', 'image/jpeg', 'image/webp'];
export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function safeReturn(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//'))
    return '/submit';
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f]/.test(decoded) || decoded.startsWith('//'))
      return '/submit';
    const target = new URL(value, 'https://return.invalid');
    if (
      target.origin !== 'https://return.invalid' ||
      target.pathname.startsWith('/auth') ||
      target.pathname.startsWith('/signin')
    )
      return '/submit';
    return target.pathname + target.search;
  } catch {
    return '/submit';
  }
}
export function validateText(
  description: string,
  improvement: string,
  constitution: number,
) {
  if (!description.trim() || !improvement.trim())
    throw new Error('Description and proposed improvement are required.');
  if (description.length > 10000 || improvement.length > 10000)
    throw new Error('Keep each text field to 10,000 characters or fewer.');
  if (!Number.isInteger(constitution) || constitution < 1 || constitution > 11)
    throw new Error('Select one of the 11 constitutions.');
}
export function validateFile(file: { size: number; type: string }) {
  if (!MIMES.includes(file.type))
    throw new Error('Choose PNG, JPEG, or WebP images.');
  if (file.size < 1 || file.size > MAX_SIZE)
    throw new Error('Each image must be nonempty and no larger than 10 MB.');
}
export function validateCount(count: number) {
  if (count < 1 || count > 5)
    throw new Error('Choose one to five screenshots.');
}
export function imageSignature(bytes: Uint8Array, mime: string) {
  return mime === 'image/png'
    ? [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
    : mime === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === 'image/webp' &&
        String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
        String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}
export function browseParams(url: URL) {
  const filter = Number(url.searchParams.get('constitution'));
  const time = url.searchParams.get('time'),
    id = url.searchParams.get('cursor');
  return {
    p_search: (url.searchParams.get('q') ?? '').trim().slice(0, 200),
    p_constitution:
      Number.isInteger(filter) && filter >= 1 && filter <= 11 ? filter : null,
    p_oldest: url.searchParams.get('sort') === 'oldest',
    p_time:
      time && !Number.isNaN(Date.parse(time)) && id && UUID.test(id)
        ? time
        : null,
    p_id:
      time && !Number.isNaN(Date.parse(time)) && id && UUID.test(id)
        ? id
        : null,
  };
}
