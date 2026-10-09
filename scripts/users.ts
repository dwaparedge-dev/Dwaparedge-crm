/**
 * Staff account administration (there is no admin UI in v1).
 *
 *   npm run users -- list
 *   npm run users -- create  --email a@b.com --name "Asha"
 *   npm run users -- passwd  --email a@b.com        (resets the password and signs the user out everywhere)
 *   npm run users -- deactivate --email a@b.com     (blocks login and ends all sessions)
 *   npm run users -- activate   --email a@b.com
 *
 * Passwords are always typed at a hidden prompt, never passed on the command line or stored in shell history.
 */
import { createInterface } from "node:readline";
import bcrypt from "bcryptjs";
import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const rounds = Number(process.env.BCRYPT_SALT_ROUNDS) || 12;

const [command, ...rest] = process.argv.slice(2);
const flag = (name: string) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function askHidden(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const w = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    process.stdout.write(prompt);
    w._writeToOutput = () => undefined; // hide what is typed
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function newPassword(): Promise<string> {
  const a = await askHidden("New password (min 12 characters): ");
  if (a.length < 12) throw new Error("Password must be at least 12 characters");
  if ((await askHidden("Repeat password: ")) !== a) throw new Error("Passwords do not match");
  return a;
}

async function run() {
  const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
  try {
    const email = flag("email")?.trim();
    const need = () => {
      if (!email) throw new Error("--email is required");
      return email;
    };
    switch (command) {
      case "list": {
        const { rows } = await pool.query("SELECT name, email, is_active, last_login_at FROM users ORDER BY created_at");
        console.table(rows.map((r) => ({ name: r.name, email: r.email, active: r.is_active, lastLogin: r.last_login_at?.toISOString() ?? "never" })));
        break;
      }
      case "create": {
        const name = flag("name")?.trim();
        if (!name) throw new Error("--name is required");
        const hash = await bcrypt.hash(await newPassword(), rounds);
        const r = await pool.query("INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) ON CONFLICT (lower(email)) DO NOTHING RETURNING id", [name, need(), hash]);
        console.log(r.rowCount ? "User created." : "A user with that email already exists. Nothing changed.");
        break;
      }
      case "passwd": {
        const hash = await bcrypt.hash(await newPassword(), rounds);
        const r = await pool.query("UPDATE users SET password_hash=$1, token_version=token_version+1, updated_at=now() WHERE lower(email)=lower($2)", [hash, need()]);
        console.log(r.rowCount ? "Password updated; all existing sessions ended." : "No such user.");
        break;
      }
      case "deactivate":
      case "activate": {
        const on = command === "activate";
        const r = await pool.query("UPDATE users SET is_active=$1, token_version=token_version+1, updated_at=now() WHERE lower(email)=lower($2)", [on, need()]);
        console.log(r.rowCount ? `User ${on ? "activated" : "deactivated"}.` : "No such user.");
        break;
      }
      default:
        console.log("Commands: list | create --email --name | passwd --email | deactivate --email | activate --email");
        process.exitCode = command ? 1 : 0;
    }
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
