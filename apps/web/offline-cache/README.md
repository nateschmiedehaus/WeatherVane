# apps/web Offline npm Cache

This folder stores the npm content-addressable cache (`_cacache`) needed to
install the front-end toolchain without network access.

## Preparing the cache (one-time on a machine with network)

1. In a clean checkout, run `npm install --prefix apps/web` to download all
   dependencies.
2. Copy `~/.npm/_cacache` into this directory, or run
   `npm install --prefix apps/web --cache "$(pwd)/offline-cache"` so the cache
   is populated in-place.
3. Commit only the metadata manifest (for example, a tarball list) or store the
   cache in artifact storage. The cache itself can be large; avoid checking the
   full `_cacache` directory into Git unless absolutely necessary.

## Using the cache offline

1. Ensure `_cacache/` exists inside this folder with the required packages.
2. From the repository root, execute:
   ```
   npm_config_cache=apps/web/offline-cache npm install --prefix apps/web --offline
   ```
   or run the helper script:
   ```
   apps/web/scripts/install_offline_deps.sh
   ```
   The helper audits the cache first and writes any gaps to
   `apps/web/offline-cache/missing-packages.txt` so they can be harvested on a
   networked host before retrying locally.
3. Run `npm run lint --prefix apps/web` and other tooling commands as usual.

Regenerate the cache whenever `package.json` changes so the content stays in
sync with the dependency graph.

## Auditing the cache inside the repo

Run `python apps/web/scripts/audit_offline_cache.py` to list which packages are
present or missing from the offline cache. Missing packages can be added on a
networked machine with:

```
npm cache add <package>@<version> --cache apps/web/offline-cache
```
