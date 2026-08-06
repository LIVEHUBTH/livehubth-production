export async function onRequestPost(context) {
  const db = context.env.DB;

  const data = await context.request.json();

  const email = data.email;
  const password = data.password;

  const user = await db
    .prepare(
      "SELECT id,name,email,role FROM users WHERE email = ? AND password = ?"
    )
    .bind(email, password)
    .first();

  if (!user) {
    return Response.json({
      success: false,
      message: "Invalid email or password"
    });
  }

  return Response.json({
    success: true,
    user
  });
}
