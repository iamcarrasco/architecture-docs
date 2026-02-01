Architecture Docs is a Fumadocs-powered documentation site with an MDXEditor admin UI that opens GitHub pull requests.

## Getting Started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Docs live at `/docs` and the editor at `/admin/editor`.

## GitHub OAuth configuration

Create a GitHub OAuth App and set:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`

The OAuth app must have access to the repo you want to edit. The user signs in with GitHub when opening `/admin/editor`. The editor lets users pick a repo they can access; `GITHUB_OWNER/GITHUB_REPO` are defaults/fallbacks.

## Content location

Docs are stored under `/content/docs` (repo root). Fumadocs uses `source.config.ts` to scan and build.
Images uploaded from the editor are saved under `public/docs-assets` by default.
Runtime docs rendering pulls from GitHub on each request and requires `GITHUB_READ_TOKEN` with read access to the repo.

## Learn More

- [Fumadocs](https://fumadocs.dev)
- [MDXEditor](https://mdxeditor.dev)
- [Next.js](https://nextjs.org/docs)

## Deployment

Deploy as a standard Next.js app. Make sure the GitHub App env vars are configured in your host.

## Concurrency and conflict handling

Draft edits are saved to a draft branch and use optimistic concurrency. Clients send the last seen draft HEAD SHA (`clientBaseSha`) with each save. If the draft head has moved, the server attempts a 3-way merge for the document; clean merges are committed automatically, otherwise a structured conflict payload is returned for UI resolution.

Update-from-main merges the base branch into the draft branch (merge policy, not rebase). If conflicts are detected, the endpoint returns the same conflict payload for resolution.
