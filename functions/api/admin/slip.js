function json(data, status = 200) {
  return Response.json(data, { status });
}

async function requireAdmin(request, env) {
  const cookieHeader =
    request.headers.get("Cookie") || "";

  const sessionToken = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) =>
      item.startsWith("livehub_session=")
    )
    ?.split("=")[1];

  if (!sessionToken) {
    return {
      error: json(
        {
          success: false,
          message: "กรุณาเข้าสู่ระบบ"
        },
        401
      )
    };
  }

  const user = await env.DB
    .prepare(`
      SELECT
        users.id,
        users.role
      FROM sessions
      JOIN users
        ON users.id = sessions.user_id
      WHERE sessions.token = ?
        AND sessions.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `)
    .bind(sessionToken)
    .first();

  if (!user) {
    return {
      error: json(
        {
          success: false,
          message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
        },
        401
      )
    };
  }

  if (user.role !== "admin") {
    return {
      error: json(
        {
          success: false,
          message: "คุณไม่มีสิทธิ์เข้าถึงไฟล์นี้"
        },
        403
      )
    };
  }

  return { user };
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const auth = await requireAdmin(request, env);

    if (auth.error) {
      return auth.error;
    }

    const url = new URL(request.url);

    const orderId = Number(
      url.searchParams.get("order_id")
    );

    if (!Number.isInteger(orderId) || orderId < 1) {
      return json(
        {
          success: false,
          message: "หมายเลขคำสั่งซื้อไม่ถูกต้อง"
        },
        400
      );
    }

    const order = await env.DB
      .prepare(`
        SELECT
          id,
          slip_key
        FROM orders
        WHERE id = ?
          AND slip_key IS NOT NULL
        LIMIT 1
      `)
      .bind(orderId)
      .first();

    if (!order) {
      return json(
        {
          success: false,
          message: "ไม่พบสลิปของคำสั่งซื้อนี้"
        },
        404
      );
    }

    const object = await env.SLIPS.get(
      order.slip_key
    );

    if (!object) {
      return json(
        {
          success: false,
          message: "ไม่พบไฟล์สลิปในระบบจัดเก็บ"
        },
        404
      );
    }

    const headers = new Headers();

    object.writeHttpMetadata(headers);

    headers.set(
      "Cache-Control",
      "private, no-store, max-age=0"
    );

    headers.set(
      "Content-Disposition",
      `inline; filename="order-${orderId}-slip"`
    );

    headers.set(
      "X-Content-Type-Options",
      "nosniff"
    );

    return new Response(object.body, {
      headers
    });
  } catch (error) {
    console.error("Admin slip error:", error);

    return json(
      {
        success: false,
        message: "เปิดไฟล์สลิปไม่สำเร็จ"
      },
      500
    );
  }
}
