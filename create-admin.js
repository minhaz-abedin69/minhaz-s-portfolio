const Database = require("better-sqlite3");
const crypto = require("crypto");
const readline = require("readline");

const db = new Database("./data/portfolio.db");

db.prepare(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`).run();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

(async () => {
  try {
    const email = (await ask("Admin email: ")).trim();
    const password = await ask("Admin password: ");

    if (!email || !email.includes("@")) {
      throw new Error("Invalid email.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const existing = db.prepare(
      "SELECT id FROM admins WHERE email = ?"
    ).get(email);

    const passwordHash = hashPassword(password);

    if (existing) {
      db.prepare(`
        UPDATE admins
        SET password_hash = ?
        WHERE email = ?
      `).run(passwordHash, email);

      console.log(`Admin password updated for ${email}`);
    } else {
      db.prepare(`
        INSERT INTO admins (email, password_hash)
        VALUES (?, ?)
      `).run(email, passwordHash);

      console.log(`Admin created for ${email}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    db.close();
  }
})();
