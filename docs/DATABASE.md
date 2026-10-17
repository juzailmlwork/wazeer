# The database

MongoDB 7 in Docker, defined by [`docker-compose.yml`](../docker-compose.yml) at the repo root.

| | |
|---|---|
| Image | `mongo:7` (Docker Hub) |
| Container | `wazeer-mongo` |
| Reachable at | `127.0.0.1:27018` → container `27017` |
| Data on disk | **`./mongodb`** in this repo (gitignored) |
| Restart policy | `unless-stopped`, so it comes back after a reboot |
| Authentication | **none** — see "Still open" |

The app connects via `MONGODB_URI` in `backend/.env`.

```bash
docker compose up -d                 # start
docker compose down                  # stop; data stays in ./mongodb
docker compose logs -f               # watch
docker exec -it wazeer-mongo mongosh wazeer    # a shell on the live database
```

## Why the data is a bind mount, not a volume

`./mongodb:/data/db` is a **bind mount**. Docker does not own it, does not track it, and cannot
delete it. That means the database is untouched by:

- `docker compose down -v`
- `docker volume prune`
- `docker system prune -a --volumes`

Verified on 18 Oct 2026: `docker compose down -v` followed by `up -d` came back with all 15
collections and all 1,162 documents, byte-for-byte the same counts as before.

`docker volume ls` lists no volume holding this data, because there isn't one.

`/data/configdb` is deliberately left unmounted. It is only used by sharded-cluster config
servers and is empty for this standalone mongod, so the anonymous volume Docker creates for it
holds nothing and does not matter if it is pruned.

### The trade-off this creates

The database now lives **inside the git working tree**. Two ways that bites:

- **`git clean -xdf` deletes ignored files**, so running it in this repo would delete the
  database. There is no warning and no undo.
- Anything that wipes or re-clones the repo directory takes the data with it.

The nightly backup to S3 (see [BACKUP.md](BACKUP.md)) is the safety net for both. It is also why
that backup matters more now than it did when the data sat in a Docker volume.

### Permissions

The image runs `mongod` as uid **999** (`mongodb`), so `./mongodb` must be owned by `999:999`.
If the container exits at startup complaining it cannot write to `/data/db`, that is why:

```bash
chown -R 999:999 /root/jusail/wazeer/mongodb
```

This matters after restoring the folder from an archive, or copying it between machines.

## Startup order

At boot, Docker starts Mongo and pm2 starts the backend independently. If the backend wins the
race it cannot connect, logs `MongoDB connection error`, and **exits** — `server.js` only calls
`app.listen()` inside the `.then()` of `mongoose.connect()`. pm2 then restarts it, and since
each attempt waits out mongoose's 30-second server-selection timeout, it keeps retrying for
long enough that Mongo is always up by then. The race self-heals; it is just worth knowing that
is the mechanism, because the symptom in between is a process pm2 reports as `online` that is
not listening on 7201.

## Moving the data

It is one directory. Stop everything, copy it, start everything:

```bash
pm2 stop wazeer-backend
docker compose down                       # a clean mongod shutdown, so WiredTiger flushes
cp -a mongodb /somewhere/else/mongodb     # or rsync, or tar
# point the volume line in docker-compose.yml at the new path
docker compose up -d
pm2 start wazeer-backend
```

Never copy `./mongodb` while mongod is running — the result is a torn WiredTiger snapshot that
may or may not open. Use the backup zip for a hot copy instead.

## History

Until 18 Oct 2026 the data lived in a Docker named volume, `wazeer-mongo-data`, and the
container was created by a bare `docker run` that existed in no file anywhere. Moving to a
bind mount made the data safe from `prune`; writing this compose file means the container is now
reproducible instead of being whatever was typed into a shell in September.

The pre-migration container (`wazeer-mongo-preCompose`) and volume (`wazeer-mongo-data`) were
kept as a rollback until the new setup had been through a `down -v` cycle, then removed on
18 Oct 2026. There is now exactly one copy of this data on the server, in `./mongodb`, plus the
nightly copies in S3. `docker volume ls` lists nothing for this project.

## Still open

- **No authentication.** `mongod` runs without `--auth`, so anything on this host can read and
  write the whole database with no password. It is bound to `127.0.0.1` only, so this is not
  reachable from the internet, but it does mean any compromised process on the box has the data.
  Turning it on means adding `MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD` to
  compose **on a fresh data directory** (the env vars do nothing on an existing one), creating
  the user by hand on the current data, and putting credentials in `MONGODB_URI`.
- **No replica set**, so there are no MongoDB transactions. `services/backup.js` works around it
  by validating before it writes and rolling back from a snapshot.
