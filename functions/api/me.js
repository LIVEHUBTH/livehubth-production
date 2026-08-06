function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...headers
    }
  });
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie") || "";

  for (const item of cookieHeader.split(";")) {
    const [key, ...valueParts] = item.trim().split("=");

    if (key === name) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

export async function onRequestGet(context) {
  try {
    const token = getCookie(
      context.request,
      "livehub_session"
    );

    if (!token) {
      return json(
        {
          success: false,
          message: "ยังไม่ได้เข้าสู่ระบบ"
        },
        401
      );
    }

    const user = await context.env.DB
      .prepare(
        `SELECT
           users.id,
           users.name,
           users.email,
           users.role
         FROM sessions
         JOIN users
           ON users.id = sessions.user_id
         WHERE sessions.token = ?
           AND sessions.expires_at > ?`
      )
      .bind(token, new Date().toISOString())
      .first();

    if (!user) {
      return json(
        {
          success: false,
          message: "Session หมดอายุหรือไม่ถูกต้อง"
        },
        401,
        {
          "Set-Cookie":
            "livehub_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
        }
      );
    }

    return json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Me error:", error);

    return json(
      {
        success: false,
        message: "ระบบขัดข้อง กรุณาลองใหม่"
      },
      500
    );
  }
}
