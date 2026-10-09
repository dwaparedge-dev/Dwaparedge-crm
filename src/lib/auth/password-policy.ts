// A short blacklist of the passwords people actually choose, plus basic sanity checks. Length (12+) does most of the work.
const COMMON = new Set([
  "password1234", "password12345", "passw0rd1234", "123456789012", "1234567890123", "qwertyuiop12", "qwerty123456", "letmein12345",
  "welcome12345", "administrator", "iloveyou1234", "abcdefghijkl", "abc123456789", "changeme1234", "dwaparedge123", "dwaparedge@123",
  "admin1234567", "adminadmin12", "000000000000", "111111111111", "123123123123", "p@ssw0rd1234", "password@123",
]);

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes

/** Returns a message when the password is not acceptable, otherwise null. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `The password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) return `The password must be at most ${MAX_PASSWORD_BYTES} bytes (about 72 characters)`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "That password is too common. Choose something harder to guess";
  if (new Set(lower).size < 5) return "The password is too repetitive. Use a mix of different characters or a longer passphrase";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "The password must not contain your email name";
  return null;
}
