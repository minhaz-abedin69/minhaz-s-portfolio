const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const DATA_DIR = path.join(ROOT, "data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const db = new Database(path.join(DATA_DIR, "portfolio.db"));

db.pragma("journal_mode = WAL");

db.prepare(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`).run();

const sessions = new Map();

function parsePasswordHash(stored) {
  const [salt, hash] = stored.split(":");
  return { salt, hash };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const { salt, hash } = parsePasswordHash(stored);

  const derived = crypto.scryptSync(password, salt, 64);
  const original = Buffer.from(hash, "hex");

  return (
    original.length === derived.length &&
    crypto.timingSafeEqual(original, derived)
  );
}

const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const adminPassword = String(process.env.ADMIN_PASSWORD || "");

if (adminEmail && adminPassword.length >= 8) {
  const existingAdmin = db.prepare("SELECT id FROM admins WHERE email = ?").get(adminEmail);

  if (!existingAdmin) {
    db.prepare("INSERT INTO admins (email, password_hash) VALUES (?, ?)")
      .run(adminEmail, hashPassword(adminPassword));
    console.log("[admin] Admin account created:", adminEmail);
  }
}

function createSession(adminId) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    adminId,
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  });
  return token;
}

function getSession(req) {
  const cookies = req.headers.cookie || "";

  const match = cookies.match(/session=([^;]+)/);
  if (!match) return null;

  const session = sessions.get(match[1]);

  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(match[1]);
    return null;
  }

  return session;
}

function json(res, status, data) {
  const body = JSON.stringify(data);

  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });

  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

function serveFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.normalize(path.join(ROOT, urlPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      return res.end("Not found");
    }

    const ext = path.extname(filePath).toLowerCase();

    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2"
    };

    res.writeHead(200, {
      "Content-Type": types[ext] || "application/octet-stream"
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/api/auth/login") {
      const body = await readBody(req);

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");

      const admin = db.prepare(`
        SELECT id, email, password_hash
        FROM admins
        WHERE email = ?
      `).get(email);

      if (!admin || !verifyPassword(password, admin.password_hash)) {
        return json(res, 401, {
          ok: false,
          message: "Invalid email or password"
        });
      }

      const token = createSession(admin.id);

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": `session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`
      });

      return res.end(JSON.stringify({
        ok: true,
        email: admin.email
      }));
    }

    if (req.method === "POST" && req.url === "/api/auth/change-password") {
      const session = getSession(req);

      if (!session) {
        return json(res, 401, {
          ok: false,
          error: "Authentication required"
        });
      }

      const body = await readBody(req);

      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");

      if (!currentPassword || !newPassword) {
        return json(res, 400, {
          ok: false,
          error: "Current password and new password are required"
        });
      }

      if (newPassword.length < 8) {
        return json(res, 400, {
          ok: false,
          error: "New password must be at least 8 characters"
        });
      }

      const admin = db.prepare(`
        SELECT id, password_hash
        FROM admins
        WHERE id = ?
      `).get(session.adminId);

      if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
        return json(res, 401, {
          ok: false,
          error: "Current password is incorrect"
        });
      }

      const newHash = hashPassword(newPassword);

      db.prepare(`
        UPDATE admins
        SET password_hash = ?
        WHERE id = ?
      `).run(newHash, admin.id);

      return json(res, 200, {
        ok: true,
        message: "Password changed successfully"
      });
    }
    if (req.method === "POST" && req.url === "/api/auth/logout") {
      const cookies = req.headers.cookie || "";
      const match = cookies.match(/session=([^;]+)/);

      if (match) {
        sessions.delete(match[1]);
      }

      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
      });

      return res.end(JSON.stringify({ ok: true }));
    }

    if (req.method === "GET" && req.url === "/api/auth/me") {
      const session = getSession(req);

      if (!session) {
        return json(res, 401, {
          ok: false,
          authenticated: false
        });
      }

      const admin = db.prepare(`
        SELECT id, email
        FROM admins
        WHERE id = ?
      `).get(session.adminId);

      return json(res, 200, {
        ok: true,
        authenticated: true,
        email: admin.email
      });
    }

    if (req.url === "/api/auth/login" ||
        req.url === "/api/auth/logout" ||
        req.url === "/api/auth/me") {
      return json(res, 404, { ok: false });
    }

    serveFile(req, res);

  } catch (error) {
    console.error(error);
    json(res, 500, {
      ok: false,
      message: "Internal server error"
    });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Portfolio running at http://localhost:${PORT}`);
});




