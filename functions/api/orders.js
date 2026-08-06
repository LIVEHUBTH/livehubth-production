function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
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

async function getCurrentUser(context) {
  const token = getCookie(
    context.request,
    "livehub_session"
  );

  if (!token) {
    return null;
  }

  return context.env.DB
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
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;

    const user = await getCurrentUser(context);

    if (!user) {
      return json(
        {
          success: false,
          message: "กรุณาเข้าสู่ระบบก่อนซื้อบัตร"
        },
        401
      );
    }

    const body = await context.request.json();
    const concertId = Number(body.concert_id);

    if (!Number.isInteger(concertId) || concertId < 1) {
      return json(
        {
          success: false,
          message: "หมายเลขคอนเสิร์ตไม่ถูกต้อง"
        },
        400
      );
    }

    const concert = await db
      .prepare(
        `SELECT
           id,
           title,
           price,
           status
         FROM concerts
         WHERE id = ?`
      )
      .bind(concertId)
      .first();

    if (!concert || concert.status !== "published") {
      return json(
        {
          success: false,
          message: "ไม่พบคอนเสิร์ตหรือยังไม่เปิดขาย"
        },
        404
      );
    }

    const existingOrder = await db
      .prepare(
        `SELECT
           id,
           amount,
           payment_status
         FROM orders
         WHERE user_id = ?
           AND event_id = ?
           AND payment_status IN ('pending', 'approved')
         ORDER BY id DESC
         LIMIT 1`
      )
      .bind(user.id, concert.id)
      .first();

    if (existingOrder) {
      return json({
        success: true,
        existing: true,
        message: "พบคำสั่งซื้อเดิม",
        orderId: existingOrder.id,
        amount: existingOrder.amount,
        paymentStatus: existingOrder.payment_status,
        title: concert.title
      });
    }

    const result = await db
      .prepare(
        `INSERT INTO orders (
           user_id,
           event_id,
           amount,
           payment_status
         )
         VALUES (?, ?, ?, 'pending')`
      )
      .bind(
        user.id,
        concert.id,
        concert.price
      )
      .run();

    return json(
      {
        success: true,
        existing: false,
        message: "สร้างคำสั่งซื้อสำเร็จ",
        orderId: result.meta.last_row_id,
        amount: concert.price,
        paymentStatus: "pending",
        title: concert.title
      },
      201
    );
  } catch (error) {
    console.error("Create order error:", error);

    return json(
      {
        success: false,
        message: "ระบบสร้างคำสั่งซื้อขัดข้อง กรุณาลองใหม่"
      },
      500
    );
  }
}
