// Failure alerts by SMS, via Notify.lk — the same service the LMS backup scripts use.
//
// Alerting must never change a run's outcome: an undeliverable SMS must not turn a good
// backup into a failed one, nor mask the original error. Every failure path here warns and
// resolves, so callers can `await alert(...)` without a try/catch.
//
//   SMS_ENABLE=true           alerts are off unless this is exactly "true"
//   SMS_USER_ID, SMS_API_KEY  Notify.lk credentials
//   SMS_SENDER_ID             registered sender (default NotifyDEMO, test-only delivery)
//   BACKUP_ALERT_SMS          comma-separated Sri Lankan mobiles
//   BACKUP_ALERT_PREFIX       tag at the start of each message (default "wazeer")
const API = 'https://app.notify.lk/api/v1/send';
const TIMEOUT_MS = 20000;
const MAX_CHARS = 600;

const warn = (m) => console.error(`[alert] ${m}`);

// Notify.lk wants 94XXXXXXXXX. Accept 07…, 7…, +94…, 94…, and any spaces or dashes.
function normalizeLk(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = `94${d.slice(1)}`;
  else if (d.length === 9 && d.startsWith('7')) d = `94${d}`;
  return /^94\d{9}$/.test(d) ? d : null;
}

async function sendOne(to, message) {
  const params = new URLSearchParams({
    user_id: process.env.SMS_USER_ID,
    api_key: process.env.SMS_API_KEY,
    sender_id: process.env.SMS_SENDER_ID || 'NotifyDEMO',
    to,
    message,
  });
  const res = await fetch(`${API}?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`unexpected response: ${body.slice(0, 200)}`);
  }
  // Notify.lk answers 200 with {"status":"error"} for a bad key or an unregistered sender.
  if (parsed.status !== 'success') throw new Error(parsed.message || body.slice(0, 200));
}

// Returns { sent, skipped } and never rejects.
async function alert(message) {
  const text = `[${process.env.BACKUP_ALERT_PREFIX || 'wazeer'}] ${message}`.slice(0, MAX_CHARS);

  const numbers = (process.env.BACKUP_ALERT_SMS || '').split(',').map((n) => n.trim()).filter(Boolean);
  const reason = numbers.length === 0 ? 'BACKUP_ALERT_SMS is not set'
    : process.env.SMS_ENABLE !== 'true' ? 'SMS_ENABLE is not "true"'
    : !process.env.SMS_USER_ID || !process.env.SMS_API_KEY ? 'SMS_USER_ID / SMS_API_KEY missing'
    : null;
  if (reason) {
    // Still put it somewhere a human can find it — the cron log.
    warn(`not sent (${reason}). Message was: ${text}`);
    return { sent: 0, skipped: true };
  }

  let sent = 0;
  for (const raw of numbers) {
    const to = normalizeLk(raw);
    if (!to) {
      warn(`skipping "${raw}" — not a valid Sri Lankan mobile`);
      continue;
    }
    try {
      await sendOne(to, text);
      console.log(`[alert] sent to ${to}`);
      sent++;
    } catch (err) {
      warn(`could not alert ${to}: ${err.message}`);
    }
  }
  return { sent, skipped: false };
}

module.exports = { alert, normalizeLk };
