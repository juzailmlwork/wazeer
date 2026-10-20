# Payable and Receivable

Two tabs tracking money lent and borrowed, kept deliberately apart from Suppliers and
Customers.

## Why a separate directory

A lender is not a vendor. Folding loans into the supplier and customer records would put
loan balances into the purchase and sale reports, where they do not belong: buying scrap on
credit and lending someone cash are different events even when it is the same person on the
other side.

So `Party` is its own collection — ledger, name and phone, nothing more.

**Each ledger keeps its own list.** A person added on Payable does not appear on Receivable;
the same name on both tabs is two independent records with their own balance and history.
Every request carries the ledger and the server scopes the lookup to it, so a payable id
cannot be used to read, edit or add to someone's receivable history — it answers 404.

Names are unique within a ledger, compared case-insensitively and after trimming, so the
same person cannot be entered twice as "Nimal" and "nimal ". Phone numbers are not unique:
relatives, and a shop and its owner, legitimately share one.

Neither ledger feeds the P/L tab, and that is correct: a loan is a balance-sheet movement,
not income or expense. Only the interest or the write-off would be, and neither is recorded
here.

## The debit and credit convention

`LedgerEntry` stores what happened (`kind`) and which book it belongs to (`ledger`). The
accounting side follows from the pair and is never stored, so the two can never contradict
each other:

| Ledger | Kind | Side | Effect |
|---|---|---|---|
| payable | charge | **credit** | we owe more — a liability rises on the credit side |
| payable | payment | **debit** | we paid some back |
| receivable | charge | **debit** | they owe more — an asset rises on the debit side |
| receivable | payment | **credit** | they paid some back |

Outstanding balance is `charges - payments` on both ledgers, so "pending" reads as a
positive number on each tab rather than flipping sign between them.

`sideOf()` in `routes/parties.js` is the only place this mapping lives.

## Indexes and cost

Three queries matter, and each has an index shaped for it. Measured with `explain()`:

| Query | Index | Notes |
|---|---|---|
| the directory | `{ledger, nameLower}` *unique* | one index does three jobs: scopes to the ledger, returns rows already in alphabetical order so the sort is free, and enforces the name rule |
| each person's totals | `{ledger, party, kind, amount}` | every field the aggregation reads is in the key, so MongoDB answers it from the index and never fetches a document |
| one person's statement | `{party, entryDate, createdAt}` | arrives in display order; no in-memory sort |
| search by phone | `{ledger, phoneDigits}` | |

Searching matches `nameLower` and `phoneDigits` rather than the display fields. A
case-insensitive regex (`/foo/i`) cannot use an index at all; matching a pre-lowercased
field needs no `/i`, so the scan stays inside the ledger's slice of the index. `phoneDigits`
also means "077 123" and "0771234567" find the same person.

### The one query that grows

The totals aggregation reads every record on the ledger, so it grows with history. Measured
on this machine, per ledger:

| Records on one ledger | Totals query |
|---|---|
| 1,000 | ~5 ms |
| 10,000 | ~27 ms |
| 100,000 | ~210 ms |

At this plant's volume — tens of people, a few hundred records a year — that is a handful of
milliseconds, and the figures are always derived from the records themselves, so they cannot
be wrong.

Caching each person's balance on their `Party` document would make the list O(people)
instead of O(records), but it would need the entry insert and the balance update to succeed
or fail together. That needs a transaction, and transactions need a replica set; this
deployment is a single `mongod`. Trading a guaranteed-correct balance for speed nobody needs
yet is the wrong way round, so the totals stay derived.

**Revisit at roughly 50,000 records on one ledger** — decades away at the current rate. The
fix then is either a replica set plus `$inc` in a transaction, or a scheduled rollup.

Everything else is already bounded: the directory count only runs while a search is
narrowing the list, deletion checks `exists()` rather than counting a whole history, and all
reads are `.lean()`.

## Dates

`entryDate` is when the money moved; `createdAt` is when it was typed in. They are usually
different — a repayment made on Friday is often entered on Monday — and the statement is
ordered and balanced by `entryDate`.

## Money

Every sum is rounded to two decimals as it is computed. Adding floats drifts (`0.1 + 0.2`),
and a balance showing `1999.9999999999998` costs more trust than it saves effort.

## Rules

- Any signed-in user can add people and records.
- Only a super admin can delete either.
- A person with records cannot be deleted at all, on either ledger. Removing them silently
  would take a loan history with it, and a balance that disappears is the one mistake in a
  ledger nobody can reconstruct afterwards. Delete the records first.
- Names are unique. Phone numbers are not: relatives, and a shop and its owner, legitimately
  share one.

## API

All routes need a token. `ledger` is required and must be `payable` or `receivable`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/parties?ledger=&search=` | directory with this ledger's totals per person, plus a ledger-wide summary |
| POST | `/api/parties` | add a person to one ledger |
| PUT | `/api/parties/:id?ledger=` | rename or change the phone |
| DELETE | `/api/parties/:id?ledger=` | super admin, and only when they have no records |
| GET | `/api/parties/:id/entries?ledger=` | statement, oldest first, with a running balance |
| POST | `/api/parties/:id/entries` | add a charge or a payment |
| DELETE | `/api/parties/:id/entries/:entryId` | super admin |

`search` matches name or phone, case-insensitively, and regex metacharacters in it are taken
literally. The `summary` returned alongside is for the whole ledger and ignores the search,
so filtering the list never changes the total shown at the top of the tab.

## Migrating from the shared directory

The first version of this feature kept one directory for both ledgers. Moving to one per
ledger needs two things, and neither happens by itself:

```
node backend/scripts/migrate-ledger-parties.js            # dry run
node backend/scripts/migrate-ledger-parties.js --apply
```

It reads each existing person's ledger back from their own records, splitting anyone with
records on both into two people. Someone with no records has no evidence either way, so they
fall to `--default-ledger` (payable) and the script says so rather than deciding quietly.

It then calls `syncIndexes()`. **Mongoose only ever adds indexes** — it never drops one the
schema stopped declaring. The old unique index on `name` survives a schema change and goes
on enforcing a rule that no longer exists, and, because legacy documents all share a missing
`nameLower`, the new unique index cannot build and is silently absent. Both problems are
invisible until something fails. `syncIndexes()` drops what the schema no longer declares
and builds what it does.

## Backups

`parties` and `ledgerentries` are ordinary collections in the same database, so the nightly
`mongodump` in `docs/BACKUP.md` already covers them. Nothing to configure.
