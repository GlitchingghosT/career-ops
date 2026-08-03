# Maintained Fork Update Policy

This repository is a maintained fork of [`santifer/career-ops`](https://github.com/santifer/career-ops). The canonical upstream remains:

```text
https://github.com/santifer/career-ops.git
```

This fork adds Hermes integration, Nigeria job sources, private candidate boundaries, portfolio evidence synchronization, compensation normalization, and work-authorization safeguards. The upstream overlay updater replaces system files and therefore cannot safely preserve these changes.

## Update safely

Review and merge upstream through Git so conflicts are explicit:

```bash
git fetch upstream
git checkout main
git merge upstream/main
npm install --ignore-scripts
node test-all.mjs --quick
git push origin main
```

Do not run `node update-system.mjs apply` in this fork. It fails closed before creating an update lock. `node update-system.mjs check` remains available and still checks the canonical upstream.

`CAREER_OPS_ALLOW_OVERLAY_UPDATE=1` is an emergency escape hatch for maintainers who intentionally accept that fork-specific system files may be overwritten. It should not be used for routine updates.
