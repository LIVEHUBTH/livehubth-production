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
          message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
        },
        401
      )
    };
  }

  if (session.role !== "admin") {
    return {
      error: json(
        {
          success: false,
          message: "ไม่มีสิทธิ์ใช้งานส่วนผู้ดูแลระบบ"
        },
        403
      )
    };
  }

  return { session };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const admin = await requireAdmin(
      request,
      env
    );

    if (admin.error) {
      return admin.error;
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          success: false,
          message: "ข้อมูลที่ส่งมาไม่ถูกต้อง"
        },
        400
      );
    }

    const orderId = Number(body.order_id);

    const action = String(
      body.action || ""
    ).trim();

    if (
      !Number.isInteger(orderId) ||
      orderId < 1
    ) {
      return json(
        {
          success: false,
          message: "หมายเลขคำสั่งซื้อไม่ถูกต้อง"
        },
        400
      );
    }

    if (
      action !== "approve" &&
      action !== "reject"
    ) {
      return json(
        {
          success: false,
          message: "คำสั่งตรวจสอบไม่ถูกต้อง"
        },
        400
      );
    }

    const order = await env.DB
      .prepare(`
        SELECT
          id,
          user_id,
          event_id,
          amount,
          payment_status,
          slip_key
        FROM orders
        WHERE id = ?
        LIMIT 1
      `)
      .bind(orderId)
      .first();

    if (!order) {
      return json(
        {
          success: false,
          message: "ไม่พบคำสั่งซื้อ"
        },
        404
      );
    }

    if (!order.slip_key) {
      return json(
        {
          success: false,
          message: "คำสั่งซื้อนี้ยังไม่มีสลิป"
        },
        409
      );
    }

    if (order.payment_status !== "submitted") {
      let message =
        "รายการนี้ไม่ได้อยู่ในสถานะรอตรวจสอบ";

      if (order.payment_status === "approved") {
        message = "รายการนี้ได้รับการอนุมัติแล้ว";
      }

      if (order.payment_status === "rejected") {
        message = "รายการนี้ถูกปฏิเสธแล้ว";
      }

      return json(
        {
          success: false,
          message
        },
        409
      );
    }

    const newStatus =
      action === "approve"
        ? "approved"
        : "rejected";

    const result = await env.DB
      .prepare(`
        UPDATE orders
        SET payment_status = ?
        WHERE id = ?
          AND payment_status = 'submitted'
      `)
      .bind(
        newStatus,
        orderId
      )
      .run();

    if (!result.success) {
      throw new Error(
        "ไม่สามารถอัปเดตสถานะการชำระเงินได้"
      );
    }

    if (
      Number(result.meta?.changes || 0) !== 1
    ) {
      return json(
        {
          success: false,
          message:
            "สถานะรายการถูกเปลี่ยนแล้ว กรุณารีเฟรชหน้า"
        },
        409
      );
    }

    return json({
      success: true,

      message:
        newStatus === "approved"
          ? "อนุมัติการชำระเงินเรียบร้อยแล้ว"
          : "ปฏิเสธการชำระเงินเรียบร้อยแล้ว",

      orderId,
      payment_status: newStatus
    });
  } catch (error) {
    console.error(
      "Verify payment error:",
      error
    );

    return json(
      {
        success: false,
        message: "ตรวจสอบการชำระเงินไม่สำเร็จ"
      },
      500
    );
  }
}
