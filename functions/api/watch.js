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

    const url = new URL(request.url);

    const eventId = Number(
      url.searchParams.get("event_id")
    );

    if (
      !Number.isInteger(eventId) ||
      eventId < 1
    ) {
      return json(
        {
          success: false,
          message: "หมายเลขคอนเสิร์ตไม่ถูกต้อง"
        },
        400
      );
    }

    const user = auth.session;

    const access = await env.DB
      .prepare(`
        SELECT
          events.id,
          events.title,
          events.description,
          events.event_date,
          events.cover_image,
          events.stream_url,
          entitlements.order_id,
          entitlements.status
        FROM entitlements
        JOIN events
          ON events.id =
             entitlements.event_id
        WHERE entitlements.user_id = ?
          AND entitlements.event_id = ?
          AND entitlements.status = 'active'
        LIMIT 1
      `)
      .bind(
        user.id,
        eventId
      )
      .first();

    if (!access) {
      return json(
        {
          success: false,
          allowed: false,
          message:
            "บัญชีนี้ไม่มีสิทธิ์เข้าชมคอนเสิร์ตนี้"
        },
        403
      );
    }

    if (!access.stream_url) {
      return json(
        {
          success: false,
          allowed: false,
          message:
            "คอนเสิร์ตนี้ยังไม่ได้ตั้งค่าระบบสตรีม"
        },
        503
      );
    }

    return json({
      success: true,
      allowed: true,

      concert: {
        id: access.id,
        title: access.title,
        description: access.description,
        event_date: access.event_date,
        cover_image: access.cover_image,

        stream_url:
          access.stream_url
      }
    });

  } catch (error) {
    console.error(
      "Watch access error:",
      error
    );

    return json(
      {
        success: false,
        allowed: false,
        message:
          "ไม่สามารถตรวจสอบสิทธิ์เข้าชมได้"
      },
      500
    );
  }
}
