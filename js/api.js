const API = "/api";

async function request(url, options = {}) {
  const res = await fetch(API + url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  return res.json();
}

export async function register(data) {
  return request("/register", {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export async function login(data) {
  return request("/login", {
    method: "POST",
    body: JSON.stringify(data)
  });
}
