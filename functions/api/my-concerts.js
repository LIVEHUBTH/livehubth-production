function json(data, status = 200) {
  return Response.json(data, { status });
}

async function requireUser(request, env) {
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

  const session = await env.DB
    .prepare(`
      SELECT
        users.id,
        users.name,
        users.email,
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

  if (!session) {
    return {
      error: json(
        {
          success: false,
          message:
            "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
        },
        401
      )
    };
  }

  return { session };
}

export async function onRequestGet(context) {
  const { request, env } = context;

  try {
    const auth = await requireUser(
      request,
      env
    );

    if (auth.error) {
      return auth.error;
    }

    const user = auth.session;

    const result = await env.DB
      .prepare(`
        SELECT
          events.id,
          events.title,
          events.description,
          events.event_date,
          events.price,
          events.cover_image,
          events.stream_url,
          entitlements.order_id,
          entitlements.status,
          entitlements.created_at
            AS access_created_at
        FROM entitlements
        JOIN events
          ON events.id =
             entitlements.event_id
        WHERE entitlements.user_id = ?
          AND entitlements.status = 'active'
        ORDER BY events.event_date ASC
      `)
      .bind(user.id)
      .all();

    return json({
      success: true,

      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },

      concerts:
        result.results || []
    });
  } catch (error) {
    console.error(
      "My concerts error:",
      error
    );

    return json(
      {
        success: false,
        message:
          "โหลดคอนเสิร์ตของฉันไม่สำเร็จ"
      },
      500
    );
  }
}
