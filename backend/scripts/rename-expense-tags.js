#!/usr/bin/env node
/**
 * Renames the expense tags from their internal codes to readable names.
 *
 * Expenses reference tags by ObjectId and never store the name, so renaming the tag
 * document is all that is needed — every historical expense picks up the new name on its
 * next read. No expense document is touched.
 *
 * Matching is on the tag's current name, trimmed and case-insensitive, because some codes
 * are stored in a different case than they were written down (GLs, S40KW, S35KW).
 *
 * Dry run by default. Pass --apply to write.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Tag = require('../models/Tag');
const Expense = require('../models/Expense');

const APPLY = process.argv.includes('--apply');

// [ current name, new name ] — exactly as supplied.
const RENAMES = [
  ['SLY', 'Salary'],
  ['DVR Charges', 'Driver charges'],
  ['DSL', 'Diesel'],
  ['HIRE CHR', 'Hire Charges'],
  ['MVM - TATA', 'Repair & other tata (1613)'],
  ['MVM - CNTR', 'Repair & other canter'],
  ['MVM - ISZU', 'Repair & other isuzu'],
  ['MVM - FLK', 'Repair & other Forklift (Komatsu)'],
  ['MVM - FTN', 'Repair & other Forton'],
  ['MVM - LYD', 'Repair & other Leyland'],
  ['GRY - HME', 'Grocery'],
  ['OTHR', 'Other Expenses'],
  ['GAS', 'Gas'],
  ['OXN', 'Oxygen'],
  ['ELY', 'Electricity'],
  ['WTR', 'Water Bill'],
  ['WBC', 'weight Bridge Charges'],
  ['BNK', 'Bank Charges'],
  ['OIL', 'All type of oil'],
  ['FE', 'Food Expenses'],
  ['LE', 'Lunch Expenses'],
  ['DTN', 'Donations'],
  ['SLE EXP', 'Scale Expenses'],
  ['WC', 'Wheel Charges'],
  ['PLCE', 'Police'],
  ['ITE', 'Income Tax Expenses'],
  ['TAC', 'Tips And Commission'],
  ['NOE', 'Non Operating Expenses'],
  ['DL', 'Disposal Lorry'],
  ['GLs', 'Gloves'],
  ['AF', 'Audit Fees'],
  ['S40KW', 'Solar 40kw'],
  ['S35KW', 'Solar 35kw'],
  ['VL', 'Vehicle Lease'],
];

const key = (s) => String(s || '').trim().toLowerCase();

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected to ${mongoose.connection.name}`);
  console.log(APPLY ? 'Applying changes.\n' : 'Dry run — nothing will be written. Pass --apply to commit.\n');

  const tags = await Tag.find().lean();
  const byKey = new Map(tags.map((t) => [key(t.name), t]));
  const usage = new Map();
  const agg = await Expense.aggregate([{ $unwind: '$tags' }, { $group: { _id: '$tags', n: { $sum: 1 } } }]);
  agg.forEach((a) => usage.set(String(a._id), a.n));

  // A rename onto a name that already belongs to another tag would merge two different
  // things under one label, or trip the unique index. Check before writing anything.
  const problems = [];
  const planned = [];
  const targets = new Set();

  for (const [from, to] of RENAMES) {
    const tag = byKey.get(key(from));
    if (!tag) { problems.push(`no tag named "${from}"`); continue; }
    if (targets.has(key(to))) { problems.push(`two tags would both become "${to}"`); continue; }
    const clash = byKey.get(key(to));
    if (clash && String(clash._id) !== String(tag._id)) {
      problems.push(`"${from}" -> "${to}" collides with the existing tag "${clash.name}"`);
      continue;
    }
    targets.add(key(to));
    planned.push({ tag, from: tag.name, to, uses: usage.get(String(tag._id)) || 0 });
  }

  planned.forEach((p) => {
    console.log(`  ${APPLY ? '•' : '(dry run)'} ${JSON.stringify(p.from).padEnd(22)} -> ${JSON.stringify(p.to).padEnd(36)} ${p.uses} expense${p.uses === 1 ? '' : 's'}`);
  });

  if (problems.length) {
    console.log('\nNothing written — resolve these first:');
    problems.forEach((p) => console.log(`  ! ${p}`));
    await mongoose.disconnect();
    process.exit(1);
  }

  const renamedIds = new Set(planned.map((p) => String(p.tag._id)));
  const untouched = tags.filter((t) => !renamedIds.has(String(t._id)));
  if (untouched.length) {
    console.log(`\nLeft alone — not in the list (${untouched.length}):`);
    untouched
      .sort((a, b) => (usage.get(String(b._id)) || 0) - (usage.get(String(a._id)) || 0))
      .forEach((t) => console.log(`    ${JSON.stringify(t.name).padEnd(22)} ${usage.get(String(t._id)) || 0} expenses`));
  }

  if (APPLY) {
    for (const p of planned) {
      await Tag.updateOne({ _id: p.tag._id }, { $set: { name: p.to } });
    }
  }

  const covered = planned.reduce((n, p) => n + p.uses, 0);
  console.log(`\n${APPLY ? 'Renamed' : 'Would rename'} ${planned.length} tags, covering ${covered} expense references.`);
  console.log('No expense document is modified — they reference tags by id.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(2);
});
