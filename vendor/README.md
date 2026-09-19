# Vendored components

The markdown editor in `src/app/markdown-editor/` is not written here — it comes
from [ilc-members-manager](https://github.com/iislucas/ilc-members-manager),
where it is actively developed. This folder records where it came from and at
which commit, so "refresh it from upstream" is one command rather than an
archaeology exercise:

```bash
pnpm run sync:markdown-editor            # pull the latest from the upstream default branch
pnpm run sync:markdown-editor -- --check  # report drift without changing anything
pnpm run sync:markdown-editor -- --ref <sha-or-branch>
```

The script copies the paths listed in `markdown-editor.json`, records the
upstream commit it took them from, and leaves the result in your working tree
for review — it never commits. Run `git diff` afterwards: local edits to these
files will be overwritten, which is the point (they should be made upstream).

## Why vendoring and not a dependency

The component is genuinely independent of both applications, so the right home
for it is its own package. Getting there is a small project of its own:

1. **Extract** `markdown-editor/` (plus `image-upload-preview/` and the two
   `icons/` files it uses) into its own repository.
2. **Package** it as an Angular library (ng-packagr — `ng generate library`
   produces the build setup), with `@angular/core`, `@milkdown/*` and
   `firebase` as peer dependencies rather than dependencies.
3. **Publish** to npm as e.g. `@iislucas/markdown-editor`, or to GitHub
   Packages if it should stay private.
4. Both apps then `pnpm add` it and delete their copy, including this folder.

The component is already close to standalone: its only coupling to a host app
is `IconComponent` and an *optional* `firebase/storage` default for image
uploads, which any host can override through the `imageUploader` input (this
app does — see `concept-edit`). Those are the two things to tidy during step 1:
inline or inject the icons, and drop the storage default so `firebase` stops
being needed at all.

Until that happens, vendoring keeps one copy of the truth upstream and makes
the refresh mechanical.
