// Cloudflare Turnstile — Token-Validierung. Wird nur aufgerufen, wenn
// CF_TURNSTILE_SECRET in der .env gesetzt ist (Config-Toggle).
//
// Doku: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

const ENDPOINT = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyToken(token, secret, remoteIp) {
  if (!token) return { success: false, reason: 'missing-token' };
  const form = new URLSearchParams();
  form.set('secret', secret);
  form.set('response', token);
  if (remoteIp) form.set('remoteip', remoteIp);

  try {
    const res = await fetch(ENDPOINT, { method: 'POST', body: form });
    if (!res.ok) return { success: false, reason: 'verify-http-' + res.status };
    const data = await res.json();
    return { success: !!data.success, reason: data['error-codes'] };
  } catch (err) {
    return { success: false, reason: 'fetch-failed' };
  }
}
