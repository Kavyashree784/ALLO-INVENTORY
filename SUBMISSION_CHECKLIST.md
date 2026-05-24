# Submission Checklist

Use this before handing the repo off or opening a PR update.

## Final Checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `node scripts/concurrency-test.mjs`
- Confirm no tracked secrets: `git status --short` should not show `.env`

## Review Checklist

- Verify the app starts with the expected `.env` values.
- Confirm reservation create/confirm/release flows still work.
- Check the cleanup route handles expired holds.
- Review the diff for accidental formatting-only noise.

## Commit Message Templates

- `chore: remove unused dependencies`
- `chore: remove dead exports`
- `fix: restore build after cleanup`
- `docs: add submission checklist`

## PR Update Template

- **Summary:** cleanup pass completed.
- **Checks:** lint, typecheck, build, concurrency test.
- **Notes:** removed unused packages and dead exports.
- **Follow-up:** review any remaining ts-prune candidates.