// Contact form handler. Sends each submission through Resend, from support@ghostplatform.ai
// to the inbox in CONTACT_TO. The customer's address is set as Reply-To, so replying goes to them.
//
// Environment variables (Vercel > Project > Settings > Environment Variables):
//   RESEND_API_KEY        required. Resend API key. Never commit it.
//   CONTACT_TO            optional. Defaults to janderson@cypher-llc.com
//   CONTACT_FROM          optional. Defaults to "G.H.O.S.T. Website <support@ghostplatform.ai>"
//   TURNSTILE_SECRET_KEY  optional. If set, the Cloudflare Turnstile token is verified.

const TO = process.env.CONTACT_TO || 'janderson@cypher-llc.com';
const FROM = process.env.CONTACT_FROM || 'G.H.O.S.T. Website <support@ghostplatform.ai>';
const ORIGINS = ['https://ghostplatform.ai', 'https://www.ghostplatform.ai'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clean = (s, max) => String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').trim().slice(0, max);

module.exports = async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && (ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};

  // Spam traps: filled honeypot, or submitted less than 3 seconds after the page loaded.
  if (body._honey) return res.status(200).json({ success: true });
  const t = parseInt(body._t, 10);
  if (t && Date.now() - t < 3000) return res.status(200).json({ success: true });

  const name = clean(body.name, 120), org = clean(body.organization, 160), email = clean(body.email, 200);
  const phone = clean(body.phone, 60), topic = clean(body.topic, 80);
  const message = String(body.message || '').trim().slice(0, 5000);
  if (!name || !email || !message || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ success: false, error: 'Missing or invalid fields' });
  }

  if (process.env.TURNSTILE_SECRET_KEY) {
    try {
      const v = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: String(body['cf-turnstile-response'] || '') })
      }).then((r) => r.json());
      if (!v.success) return res.status(400).json({ success: false, error: 'Verification failed' });
    } catch (e) {
      return res.status(502).json({ success: false, error: 'Verification unavailable' });
    }
  }

  if (!process.env.RESEND_API_KEY) return res.status(500).json({ success: false, error: 'Not configured' });

  const rows = [['Name', name], ['Organization', org], ['Email', email], ['Phone', phone], ['Topic', topic]].filter((r) => r[1]);
  const html = '<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif">' +
    rows.map((r) => '<tr><td><b>' + r[0] + '</b></td><td>' + esc(r[1]) + '</td></tr>').join('') +
    '</table><p style="font-family:sans-serif;white-space:pre-wrap">' + esc(message) + '</p>';
  const text = rows.map((r) => r[0] + ': ' + r[1]).join('\n') + '\n\n' + message;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: email,
        subject: 'G.H.O.S.T. inquiry' + (topic ? ' (' + topic + ')' : '') + ' from ' + name,
        html, text
      })
    });
    if (!r.ok) { console.error('Resend error', r.status, await r.text()); return res.status(502).json({ success: false, error: 'Send failed' }); }
  } catch (e) {
    console.error('Resend request failed', e);
    return res.status(502).json({ success: false, error: 'Send failed' });
  }

  // Plain HTML form post (no JavaScript): send the visitor on to the thank-you page.
  if (String(req.headers['content-type'] || '').indexOf('application/x-www-form-urlencoded') === 0) {
    res.setHeader('Location', '/thanks');
    return res.status(303).end();
  }
  return res.status(200).json({ success: true });
};
