#!/usr/bin/env node
/**
 * Moves the Payable/Receivable directory from one shared list to one list per ledger, and
 * reconciles the indexes.
 *
 * Two things need doing, and neither happens on its own:
 *
 *  1. Parties created before the split have no `ledger`, `nameLower` or `phoneDigits`.
 *     The ledger is read back from the person's own records; someone with records on both
 *     ledgers is split into two people, one per ledger, because that is now what they are.
 *
 *  2. Mongoose only ever adds indexes. The old unique index on `name` survives a schema
 *     change and keeps enforcing a rule that no longer exists — and, worse, the new unique
 *     index cannot build while legacy documents share a missing `nameLower`, so it is
 *     quietly absent. syncIndexes() drops what the schema no longer declares and builds
 *     what it does.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   node backend/scripts/migrate-ledger-parties.js
 *   node backend/scripts/migrate-ledger-parties.js --apply
 *   node backend/scripts/migrate-ledger-parties.js --apply --default-ledger receivable
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DEFAULT_LEDGER = (() => {
  const i = args.indexOf('--default-ledger');
  const v = i === -1 ? 'payable' : args[i + 1];
  if (!['payable', 'receivable'].includes(v)) {
    console.error(`--default-ledger must be payable or receivable, got ${v}`);
    process.exit(2);
  }
  return v;
})();

const say = (s = '') => console.log(s);
const plan = (s) => console.log(`  ${APPLY ? '•' : '(dry run)'} ${s}`);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  say(`Connected to ${mongoose.connection.name}`);
  say(APPLY ? 'Applying changes.' : 'Dry run — nothing will be written. Pass --apply to commit.');
  say();

  const legacy = await Party.find({
    $or: [{ ledger: { $exists: false } }, { nameLower: { $exists: false } }, { phoneDigits: { $exists: false } }],
  }).lean();

  say(`Parties needing attention: ${legacy.length}`);

  let moved = 0;
  let split = 0;
  const problems = [];

  for (const p of legacy) {
    const ledgers = await LedgerEntry.distinct('ledger', { party: p._id });
    const name = String(p.name || '').trim();
    const phone = String(p.phone || '').trim();
    const base = {
      name,
      phone,
      nameLower: Party.normName(name),
      phoneDigits: Party.normPhone(phone),
    };

    if (ledgers.length <= 1) {
      // No records means no evidence either way, so it falls to the default and is
      // reported rather than being decided silently.
      const ledger = ledgers[0] || DEFAULT_LEDGER;
      const why = ledgers[0] ? `${ledgers[0]} (from its records)` : `${ledger} (no records — default)`;
      plan(`${name} -> ${why}`);
      if (APPLY) await Party.updateOne({ _id: p._id }, { $set: { ...base, ledger } });
      moved += 1;
    } else {
      // Records on both ledgers: one row cannot be two people, so make it two.
      const [keep, ...rest] = ledgers;
      plan(`${name} has records on ${ledgers.join(' and ')} — keeping the ${keep} record and splitting out the rest`);
      if (APPLY) await Party.updateOne({ _id: p._id }, { $set: { ...base, ledger: keep } });
      for (const other of rest) {
        plan(`  new ${other} person "${name}", taking its ${other} records`);
        if (APPLY) {
          const clone = await Party.create({ ...base, ledger: other });
          await LedgerEntry.updateMany({ party: p._id, ledger: other }, { $set: { party: clone._id } });
        }
        split += 1;
      }
      moved += 1;
    }
  }

  // The new unique index cannot build over two people sharing a name on one ledger, so
  // find that now and say so, rather than letting syncIndexes fail with a key dump.
  say();
  const dupes = await Party.aggregate([
    { $match: { ledger: { $exists: true }, nameLower: { $exists: true } } },
    { $group: { _id: { ledger: '$ledger', nameLower: '$nameLower' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]);
  if (dupes.length) {
    dupes.forEach((d) => problems.push(`${d.n} people named "${d._id.nameLower}" on ${d._id.ledger}`));
  }

  if (problems.length) {
    say('Cannot reconcile indexes — resolve these first:');
    problems.forEach((p) => say(`  ! ${p}`));
  } else {
    const before = {
      parties: (await Party.collection.indexes()).map((i) => i.name),
      entries: (await LedgerEntry.collection.indexes()).map((i) => i.name),
    };
    say(`parties indexes before:       ${before.parties.join(', ')}`);
    say(`ledgerentries indexes before: ${before.entries.join(', ')}`);

    if (APPLY) {
      // Drops anything the schema no longer declares and builds anything missing.
      await Party.syncIndexes();
      await LedgerEntry.syncIndexes();
      const after = {
        parties: (await Party.collection.indexes()).map((i) => i.name),
        entries: (await LedgerEntry.collection.indexes()).map((i) => i.name),
      };
      say(`parties indexes after:        ${after.parties.join(', ')}`);
      say(`ledgerentries indexes after:  ${after.entries.join(', ')}`);
    } else {
      plan('syncIndexes() on parties and ledgerentries');
    }
  }

  say();
  say(`Parties updated: ${moved}${split ? `, split into ${split} extra` : ''}`);
  await mongoose.disconnect();
  process.exit(problems.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(2);
});
