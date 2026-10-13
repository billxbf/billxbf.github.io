# billxbf.github.io

Single-page personal site built with [Hugo](https://gohugo.io/) and a custom layout (no theme).

## Editing the Homepage

Each section on the page maps to one file:

| Section | File | Notes |
|---------|------|-------|
| Intro (bio) | `content/_index.md` | Markdown body |
| Name, tagline, photo, social buttons | `hugo.yaml` → `title`, `params.tagline`, `params.avatar`, `params.social` | `icon` is one of `scholar`, `github`, `x`, `linkedin`, `cv` |
| Research | `data/papers.yaml` | `title`, `url`, `image`, `authors` (markdown, bold yourself), `tags` |
| Blog | `content/posts/` | Generated automatically from posts, sorted by date |
| Misc | `data/misc.yaml` | `text` (markdown) + `photos` (`src`, `alt`) |

Paper tags take a `label` and an optional `url`. With a `url` the tag is a link; without one it's a plain badge:

```yaml
tags:
  - { label: NeurIPS 2026 }
  - { label: arXiv, url: "https://arxiv.org/abs/..." }
  - { label: GitHub, url: "https://github.com/..." }
```

Labels `GitHub`, `PDF`, `Paper`, `arXiv`, `Blog`, `Code`, `Demo`, `Preprint` and `Award` get their own colors (see `.tag-*` in `assets/css/main.css`); anything else uses the default.

Paper thumbnails go in `static/pics/papers/`; a paper without `image` shows `short` instead (defaults to the title before `:`). Wide figures work best, since they're letterboxed into a 200×130 box.

Images and PDFs go in `static/` (`static/pics/`, `static/works/`) and are referenced from the site root, e.g. `/works/polar_arxiv.pdf`.

To add, remove or reorder whole sections, edit `layouts/index.html` and the nav links in `layouts/_default/baseof.html`. All styling is in `assets/css/main.css`.

## Quick Start

```bash
# Install Hugo (macOS)
brew install hugo

git clone https://github.com/billxbf/billxbf.github.io.git

# Run local dev server
hugo server -D
```

## Common Commands

| Command | Description |
|---------|-------------|
| `hugo server -D` | Start dev server (includes drafts) |
| `hugo server` | Start dev server (published only) |
| `hugo` | Build static site to `public/` |
| `hugo new posts/my-post/index.md` | Create new blog post |

## Writing Posts

1. Create a new post as a folder so its images sit next to it:
   ```bash
   hugo new posts/my-new-post/index.md
   ```
   Put images in `content/posts/my-new-post/assets/` and reference them as `./assets/foo.png`.

2. Edit `content/posts/my-new-post/index.md`:
   ```yaml
   ---
   title: "My Post Title"
   date: 2024-12-15
   draft: false          # Set to false to publish
   showToc: true         # Optional table of contents
   ---
   
   Your content here...
   ```

3. Preview at http://localhost:1313


## Deployment

The site auto-deploys to GitHub Pages via GitHub Actions on push to `main`/`master`.

To set up:
1. Go to repo **Settings → Pages**
2. Under "Build and deployment", select **GitHub Actions**
