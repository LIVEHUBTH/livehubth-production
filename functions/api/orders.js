function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

export async function onRequestPost(context) {
  try {

    const body = await context.request.json();

    const concertId = Number(body.concert_id);
    const userId = Number(body.user_id);

    if (!concertId || !userId) {
      return json({
        success: false,
        message: "ข้อมูลไม่ถูกต้อง"
      },400);
    }

    const concert = await context.env.DB.prepare(`
      SELECT id,title,price
      FROM concerts
      WHERE id=?
    `)
    .bind(concertId)
    .first();

    if (!concert) {
      return json({
        success:false,
        message:"ไม่พบคอนเสิร์ต"
      },404);
    }

    const result = await context.env.DB.prepare(`
      INSERT INTO orders
      (
        user_id,
        event_id,
        amount,
        payment_status
      )
      VALUES
      (
        ?,?,?,?
      )
    `)
    .bind(
      userId,
      concert.id,
      concert.price,
      "pending"
    )
    .run();

    return json({
      success:true,
      orderId:result.meta.last_row_id,
      amount:concert.price
    });

  } catch(err){

    return json({
      success:false,
      message:String(err)
    },500);

  }
}
