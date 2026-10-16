import express from "express";

const app = express();
const port = process.env.PORT || 10000;
const clientKey = process.env.TIKTOK_CLIENT_KEY;
const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
const redirectUri = process.env.TIKTOK_REDIRECT_URI || "https://brand-mention-monitor.onrender.com/tiktok/callback.html";

app.use(express.json({ limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://brand-mention-monitor.onrender.com");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, configured: Boolean(clientKey && clientSecret) });
});

app.get("/api/tiktok/config", (_req, res) => {
  if (!clientKey) return res.status(503).json({ error: "tiktok_server_not_configured" });
  res.json({ client_key: clientKey, redirect_uri: redirectUri });
});

app.post("/api/tiktok/exchange", async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "authorization_code_required" });
  if (!clientKey || !clientSecret) return res.status(503).json({ error: "tiktok_server_not_configured" });

  try {
    const tokenResponse = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri
      })
    });
    const token = await tokenResponse.json();
    if (!tokenResponse.ok || token.error) return res.status(502).json({ error: "tiktok_token_exchange_failed", details: token.error_description || token.error || "TikTok rejected the code" });
    if (!token.access_token) return res.status(502).json({ error: "tiktok_access_token_missing", details: "TikTok returned no access token", tiktok_response: token });

    const profileResponse = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,avatar_url,display_name", {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || profile.error?.code !== "ok") return res.status(502).json({
      error: "tiktok_profile_request_failed",
      details: profile.error?.message || "TikTok rejected the access token",
      tiktok_code: profile.error?.code,
      log_id: profile.error?.log_id
    });

    res.json({ user: profile.data?.user || null });
  } catch (error) {
    res.status(502).json({ error: "tiktok_request_failed", details: error instanceof Error ? error.message : "Unexpected server error" });
  }
});

app.listen(port, () => console.log(`Brand Mention Monitor API listening on ${port}`));
