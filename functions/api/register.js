export async function onRequestPost(context) {
  const db = context.env.DB;

  const data = await context.request.json();

  const name = data.name;
  const email = data.email;
  const password = data.password;

  if (!name || !email || !password) {
    return Response.json({
      success: false,
      message: "Missing data"
    }, { status: 400 });
  }

  const exists = await db
    .prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (exists) {
    return Response.json({
      success: false,
      message: "Email already exists"
    });
  }

  await db
    .prepare(
      "INSERT INTO users(name,email,password) VALUES(?,?,?)"
    )
    .bind(name, email, password)
    .run();

  return Response.json({
    success: true
  });
}
