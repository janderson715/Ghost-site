// Cloudflare Worker: receives the contact form and sends it through Resend,
// from support@ghostplatform.ai to support@ghostplatform.ai. Reply-To is the customer.
//
// Worker settings (Cloudflare > Workers > ghost-contact > Settings > Variables and Secrets):
//   RESEND_API_KEY        secret, required.
//   TURNSTILE_SECRET_KEY  secret, optional. If set, the Turnstile token is verified.
//   CONTACT_TO            text, optional. Defaults to support@ghostplatform.ai
//   CONTACT_FROM          text, optional. Defaults to "G.H.O.S.T. Website <support@ghostplatform.ai>"

const ORIGINS = ['https://ghostplatform.ai', 'https://www.ghostplatform.ai'];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, max);

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin'
    };
    const reply = (obj, status) => new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...cors } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply({ success: false, error: 'Method not allowed' }, 405);
    if (!ORIGINS.includes(origin)) return reply({ success: false, error: 'Forbidden' }, 403);

    let body;
    try { body = await req.json(); } catch (e) { return reply({ success: false, error: 'Bad request' }, 400); }
    body = body || {};

    // Spam traps: filled honeypot, or sent less than 3 seconds after the page loaded.
    if (body._honey) return reply({ success: true });
    const t = parseInt(body._t, 10);
    if (t && Date.now() - t < 3000) return reply({ success: true });

    const name = clean(body.name, 120), org = clean(body.organization, 160), email = clean(body.email, 200);
    const phone = clean(body.phone, 60), topic = clean(body.topic, 80);
    const message = String(body.message || '').trim().slice(0, 5000);
    if (!name || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return reply({ success: false, error: 'Missing or invalid fields' }, 400);

    if (env.TURNSTILE_SECRET_KEY) {
      try {
        const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: String(body['cf-turnstile-response'] || '') })
        }).then((r) => r.json());
        if (!v.success) return reply({ success: false, error: 'Verification failed' }, 400);
      } catch (e) { return reply({ success: false, error: 'Verification unavailable' }, 502); }
    }

    if (!env.RESEND_API_KEY) return reply({ success: false, error: 'Not configured' }, 500);

    const rows = [['Name', name], ['Organization', org], ['Email', email], ['Phone', phone], ['Topic', topic]].filter((r) => r[1]);
    const html = '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">' +
      rows.map((r) => '<tr><td><b>' + r[0] + '</b></td><td>' + esc(r[1]) + '</td></tr>').join('') +
      '</table><p style="font-family:sans-serif;white-space:pre-wrap">' + esc(message) + '</p>';
    const text = rows.map((r) => r[0] + ': ' + r[1]).join('\n') + '\n\n' + message;

    try {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.CONTACT_FROM || 'G.H.O.S.T. Website <support@ghostplatform.ai>',
          to: [env.CONTACT_TO || 'support@ghostplatform.ai'],
          reply_to: email,
          subject: 'G.H.O.S.T. inquiry' + (topic ? ' (' + topic + ')' : '') + ' from ' + name,
          html, text
        })
      });
      if (!r.ok) { console.error('Resend error', r.status, await r.text()); return reply({ success: false, error: 'Send failed' }, 502); }
    } catch (e) { console.error('Resend request failed', e); return reply({ success: false, error: 'Send failed' }, 502); }
    return reply({ success: true });
  }
};
