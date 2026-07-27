// The password rule, shared by the server actions AND the browser forms.
//
// Kept in its own file with NO imports: `lib/password.ts` pulls in bcryptjs and
// node:crypto, which a client component cannot bundle ("Reading from node:crypto
// is not handled"). One rule, one place, usable from both sides.
export const MIN_PASSWORD_LENGTH = 8;

export function passwordProblem(plain: string): string | null {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
