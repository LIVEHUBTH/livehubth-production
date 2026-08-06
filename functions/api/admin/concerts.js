function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export async function onRequestPost(context) {
  try {
    const db = context.env.DB;
    const data = await context.request.json();

    const {
      title,
      description,
      event_date,
      price,
      image,
      live_url,
      replay_url
    } = data;

    if (!title || !event_date || !price) {
      return json({
        success: false,
        message: "กรุณากรอกข้อมูลให้ครบ"
      }, 400);
    }

    await db.prepare(`
      INSERT INTO concerts
      (title, description, event_date, price, image, live_url, replay_url, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `)
    .bind(
      title,
      description || "",
      event_date,
      Number(price),
      image || "",
      live_url || "",
      replay_url || ""
    )
    .run();

    return json({
      success: true,
      message: "เพิ่มคอนเสิร์ตสำเร็จ"
    }, 201);

  } catch (err) {
    return json({
      success: false,
      message: String(err)
    }, 500);
  }
}
