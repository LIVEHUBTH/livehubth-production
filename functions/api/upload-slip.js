export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const cookieHeader = request.headers.get("Cookie") || "";

    const sessionToken = cookieHeader
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("livehub_session="))
      ?.split("=")[1];

    if (!sessionToken) {
      return Response.json(
        {
          success: false,
          message: "กรุณาเข้าสู่ระบบ"
        },
        {
          status: 401
        }
      );
    }

    const session = await env.DB
      .prepare(`
        SELECT
          sessions.user_id
        FROM sessions
        WHERE sessions.token = ?
          AND sessions.expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `)
      .bind(sessionToken)
      .first();

    if (!session) {
      return Response.json(
        {
          success: false,
          message: "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"
        },
        {
          status: 401
        }
      );
    }

    const formData = await request.formData();

    const slipFile = formData.get("slip");
    const orderId = Number(formData.get("order_id"));

    if (!Number.isInteger(orderId) || orderId < 1) {
      return Response.json(
        {
          success: false,
          message: "หมายเลขคำสั่งซื้อไม่ถูกต้อง"
        },
        {
          status: 400
        }
      );
    }

    if (!(slipFile instanceof File)) {
      return Response.json(
        {
          success: false,
          message: "ไม่พบไฟล์สลิป"
        },
        {
          status: 400
        }
      );
    }

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(slipFile.type)) {
      return Response.json(
        {
          success: false,
          message: "รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP"
        },
        {
          status: 400
        }
      );
    }

    if (slipFile.size > 5 * 1024 * 1024) {
      return Response.json(
        {
          success: false,
          message: "ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB"
        },
        {
          status: 400
        }
      );
    }

    const order = await env.DB
      .prepare(`
        SELECT
          id,
          user_id,
          payment_status
        FROM orders
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
      `)
      .bind(orderId, session.user_id)
      .first();

    if (!order) {
      return Response.json(
        {
          success: false,
          message: "ไม่พบคำสั่งซื้อของคุณ"
        },
        {
          status: 404
        }
      );
    }

    if (order.payment_status === "approved") {
      return Response.json(
        {
          success: false,
          message: "คำสั่งซื้อนี้ชำระเงินเรียบร้อยแล้ว"
        },
        {
          status: 409
        }
      );
    }

    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp"
    };

    const extension = extensionMap[slipFile.type];

    const objectKey =
      `slips/user-${session.user_id}/` +
      `order-${orderId}-${crypto.randomUUID()}.${extension}`;

    await env.SLIPS.put(
      objectKey,
      await slipFile.arrayBuffer(),
      {
        httpMetadata: {
          contentType: slipFile.type
        },

        customMetadata: {
          orderId: String(orderId),
          userId: String(session.user_id),
          uploadedAt: new Date().toISOString()
        }
      }
    );

    await env.DB
      .prepare(`
        UPDATE orders
        SET payment_status = 'submitted'
        WHERE id = ?
          AND user_id = ?
      `)
      .bind(orderId, session.user_id)
      .run();

    return Response.json({
      success: true,
      message: "ส่งสลิปสำเร็จ รอตรวจสอบการชำระเงิน",
      objectKey
    });
  } catch (error) {
    console.error("Upload slip error:", error);

    return Response.json(
      {
        success: false,
        message: "อัปโหลดสลิปไม่สำเร็จ"
      },
      {
        status: 500
      }
    );
  }
}
