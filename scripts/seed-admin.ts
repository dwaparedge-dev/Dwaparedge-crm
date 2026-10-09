import bcrypt from "bcryptjs";
import pg from "pg";
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const { DATABASE_URL, DIRECT_URL, SEED_ADMIN_NAME, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS } = process.env;
const url = DIRECT_URL || DATABASE_URL;
if (!url || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
  throw new Error("DATABASE_URL, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required");
}
if (SEED_ADMIN_PASSWORD.length < 12 || SEED_ADMIN_PASSWORD.startsWith("CHANGE_ME")) {
  throw new Error("SEED_ADMIN_PASSWORD must be set to a real password of at least 12 characters");
}
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

async function run() {
  const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
  try {
    const hash = await bcrypt.hash(SEED_ADMIN_PASSWORD!, Number(BCRYPT_SALT_ROUNDS) || 12);
    const res = await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
      [SEED_ADMIN_NAME || "Admin", SEED_ADMIN_EMAIL!.trim(), hash],
    );
    console.log(res.rowCount ? "admin user created" : "user already exists; nothing changed");
  } finally {
    await pool.end();
  }
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
