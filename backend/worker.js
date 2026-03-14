/**
 * Real Mirror — Gemini API Proxy
 * Cloudflare Worker that keeps the Gemini key server-side.
 *
 * Secrets (set via `wrangler secret put`):
 *   GEMINI_API_KEY  — your Google AI Studio key
 *   PROXY_SECRET    — a random string also stored in the app's .env
 *
 * Rate limits (enforced per IP):
 *   - 10 requests per minute
 *   - 100 requests per day
 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Secret',
};

// In-memory rate limit store (resets per isolate — good enough for abuse prevention)
// For stricter limits, replace with Cloudflare KV or Durable Objects.
const rateLimitStore = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const minuteKey = `${ip}:min:${Math.floor(now / 60_000)}`;
  const dayKey    = `${ip}:day:${Math.floor(now / 86_400_000)}`;

  const perMin = (rateLimitStore.get(minuteKey) ?? 0) + 1;
  const perDay = (rateLimitStore.get(dayKey)    ?? 0) + 1;

  if (perMin > 10)  return { blocked: true, reason: 'Too many requests — please wait a minute.' };
  if (perDay > 100) return { blocked: true, reason: 'Daily limit reached. Try again tomorrow.' };

  rateLimitStore.set(minuteKey, perMin);
  rateLimitStore.set(dayKey,    perDay);

  // Prune old keys every ~100 requests to avoid memory growth
  if (rateLimitStore.size > 5000) {
    const cutoff = now - 90_000; // 90 seconds ago
    for (const [key] of rateLimitStore) {
      const ts = parseInt(key.split(':').pop() ?? '0');
      if (ts * 60_000 < cutoff) rateLimitStore.delete(key);
    }
  }

  return { blocked: false };
}

export default {
  async fetch(request, env) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Verify the proxy secret first (fast reject before rate-limit accounting)
    if (request.headers.get('X-Proxy-Secret') !== env.PROXY_SECRET) {
      return new Response('Unauthorized', { status: 401, headers: CORS });
    }

    // Rate limit by IP
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const limit = checkRateLimit(ip);
    if (limit.blocked) {
      return new Response(JSON.stringify({ error: { message: limit.reason } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Bad request', { status: 400, headers: CORS });
    }

    const { model, payload } = body;
    if (!model || !payload) {
      return new Response('Missing model or payload', { status: 400, headers: CORS });
    }

    // Forward to Gemini — API key never leaves this server
    const geminiRes = await fetch(
      `${GEMINI_BASE}/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const data = await geminiRes.json();
    return new Response(JSON.stringify(data), {
      status: geminiRes.status,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  },
};
