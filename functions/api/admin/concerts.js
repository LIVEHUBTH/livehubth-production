function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
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

async function getAdmin(context) {
  const token = getCookie(context.request, "livehub_session");

  if (!token) {
    return null;
  }

  return context.env.DB
    .prepare(
      `SELECT users.id, users.name, users.email, users.role
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?
         AND sessions.expires_at > ?
         AND users.role = 'admin'`
    )
    .bind(token, new Date().toISOString())
    .first();
}

export async function onRequestPost(context) {
  try {
    const admin = await getAdmin(context);

    if (!admin) {
      return json(
        {
          success: false,
          message: "ไม่มีสิทธิ์ใช้งานส่วนผู้ดูแล"
        },
        403
      );
    }

    const data = await context.request.json();

    const title = String(data.title || "").trim();
    const description = String(data.description || "").trim();
    const eventDate = String(data.event_date || "").trim();
    const price = Number(data.price);
    const image = String(data.image || "").trim();
    const liveUrl = String(data.live_url || "").trim();
    const replayUrl = String(data.replay_url || "").trim();

    if (
      !title ||
      !eventDate ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      return json(
        {
          success: false,
          message: "กรุณากรอกชื่อ วันที่ และราคาให้ถูกต้อง"
        },
        400
      );
    }

    const result = await context.env.DB
      .prepare(
        `INSERT INTO concerts (
           title,
           description,
           event_date,
           price,
           image,
           live_url,
           replay_url,
           status
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
         RETURNING id`
      )
      .bind(
        title,
        description,
        eventDate,
        Math.round(price),
        image,
        liveUrl,
        replayUrl
      )
      .first();

    return json(
      {
        success: true,
        message: "เพิ่มคอนเสิร์ตสำเร็จ",
        concertId: result.id
      },
      201
    );
  } catch (error) {
    console.error("Create concert error:", error);

    return json(
      {
        success: false,
        message: "ระบบขัดข้อง กรุณาลองใหม่"
      },
      500
    );
  }
}
