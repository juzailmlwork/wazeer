// Throttle sign-in guessing.
//
// Only *failed* attempts count, and a success clears the caller's slate. The whole plant can
// sit behind one public IP, so counting every attempt would let a few mistyped passwords lock
// out everyone; a brute-force run, being nothing but failures, still hits the wall quickly.
//
// In-memory on purpose: there is one backend process, and the same approach is already used for
// the backup download tokens in routes/backup.js. It resets on restart, which costs an attacker
// their progress too.
//
//   LOGIN_RATE_MAX_FAILURES      failures allowed per window  (default 10)
//   LOGIN_RATE_WINDOW_MINUTES    length of the window         (default 15)
const WINDOW_MS = Math.max(1, Number(process.env.LOGIN_RATE_WINDOW_MINUTES) || 15) * 60 * 1000;
const MAX_FAILURES = Math.max(1, Number(process.env.LOGIN_RATE_MAX_FAILURES) || 10);
const SWEEP_EVERY_MS = 5 * 60 * 1000;

// ip -> { failures, firstAt }
const attempts = new Map();
let lastSweep = Date.now();

// Drop expired entries occasionally so the map cannot grow without limit.
function sweep(now) {
  if (now - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = now;
  for (const [ip, rec] of attempts) {
    if (now - rec.firstAt >= WINDOW_MS) attempts.delete(ip);
  }
}

// req.ip is only the real client when `trust proxy` is set — see server.js.
const callerIp = (req) => req.ip || req.socket.remoteAddress || 'unknown';

function loginRateLimit(req, res, next) {
  const now = Date.now();
  sweep(now);
  const ip = callerIp(req);

  let rec = attempts.get(ip);
  if (rec && now - rec.firstAt >= WINDOW_MS) {
    attempts.delete(ip);
    rec = undefined;
  }

  if (rec && rec.failures >= MAX_FAILURES) {
    const retryAfterSec = Math.max(1, Math.ceil((rec.firstAt + WINDOW_MS - now) / 1000));
    const minutes = Math.ceil(retryAfterSec / 60);
    console.warn(`[login] blocked ${ip}: ${rec.failures} failed attempts in the last ${WINDOW_MS / 60000} min`);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({
      message: `Too many failed sign-in attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    });
  }

  res.on('finish', () => {
    // A correct password clears the record; 401 is a wrong one. Anything else (a malformed
    // body, a database fault) is not a guess and must not count against the caller.
    if (res.statusCode === 200) return void attempts.delete(ip);
    if (res.statusCode !== 401) return;

    const at = Date.now();
    const current = attempts.get(ip);
    if (current && at - current.firstAt < WINDOW_MS) current.failures++;
    else attempts.set(ip, { failures: 1, firstAt: at });
  });

  next();
}

module.exports = { loginRateLimit, MAX_FAILURES, WINDOW_MS };
