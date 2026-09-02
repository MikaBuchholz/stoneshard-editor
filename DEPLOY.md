# Deploying to GitHub Pages

The app is a static site. GitHub builds it with the workflow in `.github/workflows/deploy.yml`
and serves it at `https://<your-github-name>.github.io/<repo-name>/`. Nothing else is needed:
no server, no secrets, no build on your machine.

## One-time setup

1. **Create the repository on GitHub.**
   Go to https://github.com/new. Name it, for example `stoneshard-save-editor`. Public, no
   README, no .gitignore, no license (the project already has what it needs). Create it.

2. **Turn the project folder into a git repository and push it.**
   In a terminal:

   ```bash
   cd ~/Desktop/stoneshard
   git init -b main
   git add .
   git commit -m "Stoneshard save editor"
   git remote add origin https://github.com/<your-github-name>/<repo-name>.git
   git push -u origin main
   ```

   `.gitignore` keeps `vanilla.rar`, `vanilla.win`, `test/` and `node_modules/` out of the
   repository. Check with `git status` before committing if unsure.

3. **Tell GitHub Pages to use the workflow.**
   In the repository: Settings → Pages → under "Build and deployment", set Source to
   **GitHub Actions**. Nothing else to pick.

4. **Wait for the first deploy.**
   Open the Actions tab. "Deploy to GitHub Pages" runs on the push you just made; it takes
   about a minute. When it is green, the URL is shown on the deploy job and under Settings → Pages.

   If the workflow ran before you switched the Pages source, re-run it from the Actions tab
   (or push again).

## Updating the site

Every push to `main` redeploys. Edit, commit, push:

```bash
git add .
git commit -m "describe the change"
git push
```

## After a game update

Rebuild the catalog from the new `data.win`, commit the regenerated files, push:

```bash
python3 tools/build_catalog.py "/path/to/Stoneshard/data.win"
git add app/public/catalog app/public/sprites
git commit -m "catalog for game version x.y.z"
git push
```

## How the pieces fit

- `vite build --base=/<repo-name>/` makes every asset path start with the repository name,
  which is where GitHub Pages hosts project sites. The workflow fills the name in automatically,
  so renaming the repository needs no code change.
- The app reads the catalog and sprites relative to that base, so they work locally and deployed.
- Tests run in the workflow before the build; a failing test blocks the deploy.

## Custom domain (optional)

Settings → Pages → Custom domain. If you do this, the site is served from the domain root,
so change the build step in `.github/workflows/deploy.yml` to `pnpm build --base=/`.

## If something goes wrong

- **404 on the site, or a blank page:** the Pages source is not set to GitHub Actions, or the
  workflow has not finished. Check Settings → Pages and the Actions tab.
- **Page loads but says it cannot load the item catalog:** the base path is wrong, usually after
  adding a custom domain without changing `--base`.
- **Workflow fails at `pnpm install`:** the lockfile is out of date. Run `pnpm install` in `app/`,
  commit `app/pnpm-lock.yaml`, push.
