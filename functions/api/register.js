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

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hash = new Uint8Array(
    await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 120000,
        hash: "SHA-256"
      },
      key,
      256
    )
  );

  return `pbkdf2$120000$${base64Url(salt)}$${base64Url(hash)}`;
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const data = await context.request.json();

    const name = String(data.name || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (!name || !email || !password) {
      return json(
        {
          success: false,
          message: "กรุณากรอกข้อมูลให้ครบ"
        },
        400
      );
    }

    if (password.length < 8) {
      return json(
        {
          success: false,
          message: "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"
        },
        400
      );
    }

    const existingUser = await db
      .prepare("SELECT id FROM users WHERE email = ?")
      .bind(email)
      .first();

    if (existingUser) {
      return json(
        {
          success: false,
          message: "อีเมลนี้ถูกใช้งานแล้ว"
        },
        409
      );
    }

    const passwordHash = await hashPassword(password);

    await db
      .prepare(
        `INSERT INTO users (name, email, password, role)
         VALUES (?, ?, ?, 'user')`
      )
      .bind(name, email, passwordHash)
      .run();

    return json(
      {
        success: true,
        message: "สมัครสมาชิกสำเร็จ"
      },
      201
    );
  } catch (error) {
    console.error("Register error:", error);

    return json(
      {
        success: false,
        message: "ระบบขัดข้อง กรุณาลองใหม่"
      },
      500
    );
  }
}
