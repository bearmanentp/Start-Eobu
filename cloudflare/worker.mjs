const sessionLifetime = 30 * 86400;
const stateLifetime = 600;

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/api/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function readCookie(request, name) {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((field) => field.trim())
    .find((field) => field.startsWith(name + "="))
    ?.slice(name.length + 1);
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
async function digest(value) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  );
}
function redirect(location, cookies) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
  });
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(null, { status: 302, headers });
}
const providers = {
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    profile: "https://api.github.com/user",
    callback: "/api/callback",
  },
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    profile: "https://openidconnect.googleapis.com/v1/userinfo",
    callback: "/api/callback/google",
  },
};

async function login(url, provider, config, clientId) {
  const state = randomToken();
  const verifier = randomToken();
  const target = new URL(config.authorize);
  target.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: url.origin + config.callback,
    state,
    code_challenge: await digest(verifier),
    code_challenge_method: "S256",
    ...(provider === "google"
      ? { response_type: "code", scope: "openid profile" }
      : {}),
  }).toString();
  return redirect(target.href, [
    cookie(
      "__Secure-eobu-oauth-" + provider,
      state + "." + verifier,
      stateLifetime,
    ),
  ]);
}
async function callback(
  request,
  url,
  env,
  provider,
  config,
  clientId,
  clientSecret,
) {
  const stateCookie = "__Secure-eobu-oauth-" + provider;
  const clear = cookie(stateCookie, "", 0);
  const [state, verifier] = (readCookie(request, stateCookie) ?? "").split(".");
  const code = url.searchParams.get("code");
  if (!state || !verifier || state !== url.searchParams.get("state") || !code)
    return redirect("/?login=failed", [clear]);
  try {
    const result = await fetch(config.token, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: url.origin + config.callback,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(8000),
    });
    const { access_token } = await result.json();
    if (!result.ok || !access_token) return redirect("/?login=failed", [clear]);
    const profile = await fetch(config.profile, {
      headers: {
        Authorization: "Bearer " + access_token,
        "User-Agent": "Start-Eobu",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    const identity = await profile.json();
    if (!profile.ok) return redirect("/?login=failed", [clear]);
    const userId =
      provider === "google"
        ? typeof identity.sub === "string" && identity.sub
          ? "google:" + identity.sub
          : null
        : Number.isSafeInteger(identity.id)
          ? String(identity.id)
          : null;
    const displayName =
      provider === "google" ? identity.name || "Google 사용자" : identity.login;
    if (!userId || typeof displayName !== "string")
      return redirect("/?login=failed", [clear]);
    const token = randomToken();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE expires <= ?").bind(now),
      env.DB.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").bind(
        await digest(token),
        userId,
        displayName.slice(0, 160),
        now + sessionLifetime,
      ),
    ]);
    return redirect("/", [
      clear,
      cookie("__Secure-eobu-session", token, sessionLifetime),
    ]);
  } catch {
    return redirect("/?login=failed", [clear]);
  }
}
async function conversationBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  let contents = "";
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 750000) {
      await reader.cancel();
      return null;
    }
    contents += decoder.decode(value, { stream: true });
  }
  try {
    const record = JSON.parse(contents + decoder.decode());
    if (
      !Number.isSafeInteger(record?.revision) ||
      record.revision < 0 ||
      !Array.isArray(record.turns) ||
      !record.turns.length ||
      !record.turns.every(
        (turn) =>
          typeof turn?.q === "string" &&
          typeof turn.text === "string" &&
          Array.isArray(turn.refs) &&
          turn.refs.every(
            (ref) =>
              typeof ref?.id === "string" && typeof ref.title === "string",
          ),
      )
    )
      return null;
    return record;
  } catch {
    return null;
  }
}
async function api(request, url, env) {
  const path = url.pathname;
  const configured = Object.keys(providers).filter((provider) => {
    const prefix = provider.toUpperCase() + "_CLIENT_";
    return env[prefix + "ID"] && env[prefix + "SECRET"];
  });
  const enabled = configured.length > 0;
  if (!enabled)
    return path === "/api/session"
      ? json({ enabled, providers: configured })
      : json({ error: "unavailable" }, 503);
  const auth = /^\/api\/(login|callback)(?:\/(github|google))?$/.exec(path);
  if (request.method === "GET" && auth) {
    const provider = auth[2] ?? "github";
    if (!configured.includes(provider))
      return json({ error: "unavailable" }, 503);
    const config = providers[provider];
    const prefix = provider.toUpperCase() + "_CLIENT_";
    const clientId = env[prefix + "ID"],
      clientSecret = env[prefix + "SECRET"];
    return auth[1] === "login"
      ? login(url, provider, config, clientId)
      : callback(request, url, env, provider, config, clientId, clientSecret);
  }
  if (request.method !== "GET" && request.headers.get("Origin") !== url.origin)
    return json({ error: "origin" }, 403);
  const token = readCookie(request, "__Secure-eobu-session");
  const tokenHash = token ? await digest(token) : null;
  const session = tokenHash
    ? await env.DB.prepare(
        "SELECT user_id, login FROM sessions WHERE token_hash = ? AND expires > ?",
      )
        .bind(tokenHash, Math.floor(Date.now() / 1000))
        .first()
    : null;
  if (request.method === "GET" && path === "/api/session")
    return json({
      enabled,
      providers: configured,
      login: session?.login ?? null,
      provider: session
        ? session.user_id.startsWith("google:")
          ? "google"
          : "github"
        : null,
    });
  if (!session) return json({ error: "unauthorized" }, 401);
  if (request.method === "POST" && path === "/api/logout") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie("__Secure-eobu-session", "", 0),
    });
  }
  if (request.method === "GET" && path === "/api/conversations") {
    const { results } = await env.DB.prepare(
      "SELECT id, updated_at AS updatedAt, revision, turns FROM conversations WHERE user_id = ? ORDER BY updated_at DESC",
    )
      .bind(session.user_id)
      .all();
    return json(
      results.map((row) => ({ ...row, turns: JSON.parse(row.turns) })),
    );
  }
  const match = /^\/api\/conversations\/([a-f0-9-]{36})$/.exec(path);
  if (request.method === "PUT" && match) {
    const body = await conversationBody(request);
    if (!body) return json({ error: "invalid_conversation" }, 400);
    const id = match[1],
      updatedAt = Date.now(),
      turns = JSON.stringify(body.turns);
    const statement =
      body.revision === 0
        ? env.DB.prepare(
            "INSERT INTO conversations VALUES (?, ?, ?, 1, ?) ON CONFLICT(user_id, id) DO NOTHING",
          ).bind(session.user_id, id, updatedAt, turns)
        : env.DB.prepare(
            "UPDATE conversations SET updated_at = ?, revision = revision + 1, turns = ? WHERE user_id = ? AND id = ? AND revision = ?",
          ).bind(updatedAt, turns, session.user_id, id, body.revision);
    const result = await statement.run();
    if (!result.meta.changes) return json({ error: "revision" }, 409);
    return json({
      id,
      updatedAt,
      revision: body.revision + 1,
      turns: body.turns,
    });
  }
  return json({ error: "not_found" }, 404);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await api(request, url, env);
    } catch {
      return json({ error: "server" }, 500);
    }
  },
};
