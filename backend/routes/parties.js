const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Party = require('../models/Party');
const LedgerEntry = require('../models/LedgerEntry');
const auth = require('../middleware/auth');

const LEDGERS = ['payable', 'receivable'];

// Money, so two decimals. Summing floats drifts (0.1 + 0.2), and a balance that reads
// 1999.9999999999998 on screen destroys confidence in the whole page.
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function readLedger(req, res) {
  const ledger = String(req.query.ledger || req.body.ledger || '').trim();
  if (!LEDGERS.includes(ledger)) {
    res.status(400).json({ message: "ledger must be 'payable' or 'receivable'" });
    return null;
  }
  return ledger;
}

// Loads a party and checks it belongs to the ledger being asked about, so a payable id
// cannot be used to read or write someone's receivable history.
async function findParty(id, ledger) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Party.findOne({ _id: id, ledger }).lean();
}

// Which column an entry falls in. The single source of truth for the convention described
// in models/LedgerEntry.js.
const sideOf = (ledger, kind) => {
  if (ledger === 'payable') return kind === 'charge' ? 'credit' : 'debit';
  return kind === 'charge' ? 'debit' : 'credit';
};

const shape = (e) => ({
  _id: e._id,
  party: e.party,
  ledger: e.ledger,
  kind: e.kind,
  side: sideOf(e.ledger, e.kind),
  amount: round2(e.amount),
  description: e.description || '',
  entryDate: e.entryDate,
  createdBy: e.createdBy || '',
  createdAt: e.createdAt,
});

// GET /api/parties?ledger=payable&search=foo
// The directory for one ledger with each person's running totals attached, so the list
// needs one round trip rather than one per row.
router.get('/', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    const search = String(req.query.search || '').trim();

    // Every query starts with `ledger`, the leading field of both indexes, so none of them
    // ever looks at the other tab's rows.
    const filter = { ledger };
    if (search) {
      const or = [{ nameLower: new RegExp(escapeRegex(search.toLowerCase())) }];
      const digits = Party.normPhone(search);
      if (digits) or.push({ phoneDigits: new RegExp(escapeRegex(digits)) });
      filter.$or = or;
    }

    const [parties, totals] = await Promise.all([
      // Sorted by the index, so MongoDB walks it in order instead of collecting and
      // sorting the whole directory in memory.
      Party.find(filter).sort({ nameLower: 1 }).lean(),
      LedgerEntry.aggregate([
        { $match: { ledger } },
        {
          $group: {
            _id: '$party',
            charges: { $sum: { $cond: [{ $eq: ['$kind', 'charge'] }, '$amount', 0] } },
            payments: { $sum: { $cond: [{ $eq: ['$kind', 'payment'] }, '$amount', 0] } },
            entryCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const byParty = new Map(totals.map((t) => [String(t._id), t]));
    const rows = parties.map((p) => {
      const t = byParty.get(String(p._id));
      const charges = round2(t?.charges || 0);
      const payments = round2(t?.payments || 0);
      return {
        _id: p._id,
        name: p.name,
        phone: p.phone,
        charges,
        payments,
        pending: round2(charges - payments),
        entryCount: t?.entryCount || 0,
      };
    });

    // Ledger-wide figures come from the aggregation rather than from `rows`, so a search
    // never changes the totals shown at the top of the tab.
    const allCharges = round2(totals.reduce((s, t) => s + t.charges, 0));
    const allPayments = round2(totals.reduce((s, t) => s + t.payments, 0));

    res.json({
      parties: rows,
      summary: {
        ledger,
        charges: allCharges,
        payments: allPayments,
        pending: round2(allCharges - allPayments),
        partiesWithActivity: totals.length,
        // Only worth a query while a search is narrowing the list; otherwise the list we
        // just built is the answer.
        partyCount: search ? await Party.countDocuments({ ledger }) : rows.length,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    if (!name) return res.status(400).json({ message: 'Name is required' });
    if (!phone) return res.status(400).json({ message: 'Phone number is required' });

    const party = await Party.create({
      ledger,
      name,
      phone,
      nameLower: Party.normName(name),
      phoneDigits: Party.normPhone(phone),
    });
    res.status(201).json(party);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: `Someone with that name is already on the ${ledger} list` });
    }
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    const update = {};
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: 'Name is required' });
      update.name = name;
      update.nameLower = Party.normName(name);
    }
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (!phone) return res.status(400).json({ message: 'Phone number is required' });
      update.phone = phone;
      update.phoneDigits = Party.normPhone(phone);
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Person not found' });
    }
    const party = await Party.findOneAndUpdate(
      { _id: req.params.id, ledger },
      update,
      { new: true, runValidators: true }
    );
    if (!party) return res.status(404).json({ message: 'Person not found' });
    res.json(party);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: `Someone with that name is already on the ${ledger} list` });
    }
    res.status(400).json({ message: err.message });
  }
});

// Refuses while any record remains. Removing the person silently would take a loan history
// with it, and a balance that vanishes is the one mistake in a ledger nobody can
// reconstruct afterwards.
router.delete('/:id', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    const party = await findParty(req.params.id, ledger);
    if (!party) return res.status(404).json({ message: 'Person not found' });

    // Stops at the first hit rather than counting the whole history.
    const hasEntries = await LedgerEntry.exists({ party: party._id });
    if (hasEntries) {
      const entries = await LedgerEntry.countDocuments({ party: party._id });
      return res.status(400).json({
        message: `This person still has ${entries} record${entries === 1 ? '' : 's'}. Delete the records first.`,
      });
    }

    await Party.deleteOne({ _id: party._id });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/parties/:id/entries?ledger=payable
// Oldest first with a running balance, the way a statement is read.
router.get('/:id/entries', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    const party = await findParty(req.params.id, ledger);
    if (!party) return res.status(404).json({ message: 'Person not found' });

    // Matches the { party, entryDate, createdAt } index exactly, so this arrives sorted.
    const entries = await LedgerEntry.find({ party: party._id })
      .sort({ entryDate: 1, createdAt: 1 })
      .lean();

    let balance = 0;
    let charges = 0;
    let payments = 0;
    const rows = entries.map((e) => {
      balance = round2(balance + (e.kind === 'charge' ? e.amount : -e.amount));
      if (e.kind === 'charge') charges = round2(charges + e.amount);
      else payments = round2(payments + e.amount);
      return { ...shape(e), balance };
    });

    res.json({
      party,
      ledger,
      entries: rows,
      summary: { charges, payments, pending: round2(charges - payments), entryCount: rows.length },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/entries', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  try {
    const { kind, description } = req.body;
    if (!['charge', 'payment'].includes(kind)) {
      return res.status(400).json({ message: "kind must be 'charge' or 'payment'" });
    }
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than zero' });
    }

    const party = await findParty(req.params.id, ledger);
    if (!party) return res.status(404).json({ message: 'Person not found' });

    const entryDate = req.body.entryDate ? new Date(req.body.entryDate) : new Date();
    if (Number.isNaN(entryDate.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    const entry = await LedgerEntry.create({
      party: party._id,
      // From the party, never from the request, so the copy cannot disagree with it.
      ledger: party.ledger,
      kind,
      amount: round2(amount),
      description: typeof description === 'string' ? description.trim() : '',
      entryDate,
      createdBy: req.user.username,
    });

    res.status(201).json(shape(entry.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id/entries/:entryId', auth, async (req, res) => {
  const ledger = readLedger(req, res);
  if (!ledger) return;
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ message: 'Only super admin can delete' });
  }
  try {
    if (!mongoose.isValidObjectId(req.params.id) || !mongoose.isValidObjectId(req.params.entryId)) {
      return res.status(404).json({ message: 'Record not found' });
    }
    const entry = await LedgerEntry.findOneAndDelete({
      _id: req.params.entryId,
      party: req.params.id,
      ledger,
    });
    if (!entry) return res.status(404).json({ message: 'Record not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
