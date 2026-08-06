function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestGet(context) {
  try {
    const result = await context.env.DB
      .prepare(
        `SELECT
           id,
           title,
           description,
           event_date,
           price,
           image,
           status
         FROM concerts
         WHERE status = ?
         ORDER BY event_date ASC, id DESC`
      )
      .bind("published")
      .all();

    return json({
      success: true,
      concerts: result.results || []
    });
  } catch (error) {
    console.error("Concert list error:", error);

    return json(
      {
        success: false,
        message: "โหลดรายการคอนเสิร์ตไม่สำเร็จ"
      },
      500
    );
  }
}
