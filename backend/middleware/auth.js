const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// Resolve the token *and* the account behind it, on every request.
//
// A token on its own is not enough. It is valid for 24 hours and says nothing about what has
// happened since it was issued, so deleting a user, resetting their password or changing their
// role would otherwise not take effect until it expired — a deleted user could keep working,
// and keep creating records, for the rest of the day.
//
// The cost is one indexed lookup by _id per request. At this size (a handful of users, a 1.5 MB
// database on the same host) that is a fraction of a millisecond, and immediacy is worth more.
async function resolve(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token provided' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  // A token whose subject is not an id at all is a bad token, not a database problem.
  if (!mongoose.isValidObjectId(decoded.id)) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  let user;
  try {
    user = await User.findById(decoded.id).select('username name role mustChangePassword').lean();
  } catch (err) {
    // A database blip must not look like a bad token: answering 401 here would sign every user
    // out, because the frontend treats 401 as an expired session.
    console.error('[auth] could not load the account:', err.message);
    return res.status(503).json({ message: 'Service temporarily unavailable. Please try again.' });
  }

  // The account was deleted while this session was open. 401 so the browser clears it and shows
  // the login page, rather than leaving someone inside a half-working app.
  if (!user) {
    return res.status(401).json({ message: 'Your account is no longer active. Please sign in again.' });
  }

  // Read from the database, not from the token, so a change of role or a password reset applies
  // to the session already in progress.
  req.user = {
    id: String(user._id),
    username: user.username,
    name: user.name,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
  next();
}

// What every route uses except the password-change one. A password a super admin set for someone
// else opens nothing until that person replaces it. The check lives here, not in the browser, so
// it cannot be stepped around by calling the API directly.
function auth(req, res, next) {
  resolve(req, res, () => {
    if (req.user.mustChangePassword) {
      return res.status(403).json({
        code: 'password_change_required',
        message: 'Choose a new password before continuing',
      });
    }
    next();
  });
}

module.exports = auth;
// Choosing a new password is the one thing a user holding a one-time password may do, so that
// route resolves the account without the gate above.
module.exports.verifyOnly = resolve;
