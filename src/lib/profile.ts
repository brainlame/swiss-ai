export function validateNames(first: unknown, last: unknown) {
  if (
    typeof first !== 'string' ||
    typeof last !== 'string' ||
    ![first, last].every(
      (v) =>
        v.trim().length >= 1 &&
        v.trim().length <= 80 &&
        !/[\p{Cc}\p{Cf}]/u.test(v),
    )
  )
    throw new Error('Enter your first and last name (1–80 characters each).');
  return { first: first.trim(), last: last.trim() };
}
export async function avatarBytes(file: File) {
  if (
    file.size > 2097152 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  )
    throw new Error('Choose a PNG, JPEG, or WebP image up to 2 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n);
  const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp =
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if (!(
    (file.type === 'image/png' && png) ||
    (file.type === 'image/jpeg' && jpg) ||
    (file.type === 'image/webp' && webp)
  ))
    throw new Error(
      'This file is not a supported image. Choose a PNG, JPEG, or WebP picture.',
    );
  return bytes;
}
