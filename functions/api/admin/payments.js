function json(data, status = 200) {
  return Response.json(data, { status });
}

async function requireAdmin(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const sessionToken = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("livehub_session="))
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
          message: "คุณไม่มีสิทธิ์เข้าถึงหน้านี้"
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

    const result = await env.DB
      .prepare(`
        SELECT
          orders.id,
          orders.user_id,
          orders.event_id,
          orders.amount,
          orders.payment_status,
          orders.slip_key,
          orders.slip_uploaded_at,
          orders.created_at,

          users.name AS customer_name,
          users.email AS customer_email,

          concerts.title AS concert_title,
          concerts.event_date
        FROM orders
        LEFT JOIN users
          ON users.id = orders.user_id
        LEFT JOIN concerts
          ON concerts.id = orders.event_id
        WHERE orders.slip_key IS NOT NULL
          AND orders.payment_status IN (
            'submitted',
            'approved',
            'rejected'
          )
        ORDER BY
          CASE orders.payment_status
            WHEN 'submitted' THEN 1
            WHEN 'rejected' THEN 2
            WHEN 'approved' THEN 3
            ELSE 4
          END,
          orders.slip_uploaded_at DESC,
          orders.id DESC
      `)
      .all();

    return json({
      success: true,
      payments: result.results || []
    });
  } catch (error) {
    console.error("Admin payments error:", error);

    return json(
      {
        success: false,
        message: "โหลดรายการชำระเงินไม่สำเร็จ"
      },
      500
    );
  }
}
