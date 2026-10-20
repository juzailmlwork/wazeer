# Payable and Receivable

Two tabs tracking money lent and borrowed, kept deliberately apart from Suppliers and
Customers.

## Why a separate directory

A lender is not a vendor. Folding loans into the supplier and customer records would put
loan balances into the purchase and sale reports, where they do not belong: buying scrap on
credit and lending someone cash are different events even when it is the same person on the
other side.

So `Party` is its own collection — name and phone, nothing more. One directory serves both
ledgers, because the same person can owe the business money and be owed it.

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
| POST | `/api/parties` | add a person |
| PUT | `/api/parties/:id` | rename or change the phone |
| DELETE | `/api/parties/:id` | super admin, and only when they have no records |
| GET | `/api/parties/:id/entries?ledger=` | statement, oldest first, with a running balance |
| POST | `/api/parties/:id/entries` | add a charge or a payment |
| DELETE | `/api/parties/:id/entries/:entryId` | super admin |

`search` matches name or phone, case-insensitively, and regex metacharacters in it are taken
literally. The `summary` returned alongside is for the whole ledger and ignores the search,
so filtering the list never changes the total shown at the top of the tab.

## Backups

`parties` and `ledgerentries` are ordinary collections in the same database, so the nightly
`mongodump` in `docs/BACKUP.md` already covers them. Nothing to configure.
