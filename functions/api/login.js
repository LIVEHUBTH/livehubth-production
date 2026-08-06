const encoder = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function decodeBase64Url(value) {
  let text = value
    .replaceAll("-", "+")
    .replaceAll("_", "/");

  while (text.length % 4) {
    text += "=";
  }

  return Uint8Array.from(atob(text), char => char.charCodeAt(0));
}

async function verifyPassword(password, storedPassword) {
  const parts = String(storedPassword || "").split("$");

  if (parts.length !== 4 || parts[0] !== "pbkdf2") {
    return false;
  }

  const iterations = Number(parts[1]);
  const salt = decodeBase64Url(parts[2]);
  const expectedHash = decodeBase64Url(parts[3]);

  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100000) {
    return false;
  }

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const actualHash = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256"
      },
      key,
      256
    )
  );

  if (actualHash.length !== expectedHash.length) {
    return false;
  }

  let difference = 0;

  for (let i = 0; i < actualHash.length; i++) {
    difference |= actualHash[i] ^ expectedHash[i];
  }

  return difference === 0;
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const data = await context.request.json();

    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (!email || !password) {
      return json(
        {
          success: false,
          message: "กรุณากรอกอีเมลและรหัสผ่าน"
        },
        400
      );
    }

    const user = await db
      .prepare(
        `SELECT id, name, email, role, password
         FROM users
         WHERE email = ?`
      )
      .bind(email)
      .first();

    if (!user) {
      return json(
        {
          success: false,
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
        },
        401
      );
    }

    const validPassword = await verifyPassword(password, user.password);

    if (!validPassword) {
      return json(
        {
          success: false,
          message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
        },
        401
      );
    }

    const sessionTokenBytes = crypto.getRandomValues(new Uint8Array(32));
const sessionToken = base64Url(sessionTokenBytes);

const expiresAt = new Date(
  Date.now() + 7 * 24 * 60 * 60 * 1000
).toISOString();

await db
  .prepare(
    `INSERT INTO sessions (user_id, token, expires_at)
     VALUES (?, ?, ?)`
  )
  .bind(user.id, sessionToken, expiresAt)
  .run();

return json(
  {
    success: true,
    message: "เข้าสู่ระบบสำเร็จ",
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  },
  200,
  {
    "Set-Cookie":
      `livehub_session=${sessionToken}; ` +
      `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
  });
  } catch (error) {
    console.error("Login error:", error);

    return json(
      {
        success: false,
        message: "ระบบขัดข้อง กรุณาลองใหม่"
      },
      500
    );
  }
}
