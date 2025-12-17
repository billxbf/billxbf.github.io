# Binfeng'Log

Personal blog built with [Hugo](https://gohugo.io/) and [PaperMod](https://github.com/adityatelange/hugo-PaperMod) theme.

## Quick Start

```bash
# Install Hugo (macOS)
brew install hugo

# Clone with submodules (for the theme)
git clone --recurse-submodules https://github.com/billxbf/billxbf.github.io.git

# Run local dev server
hugo server -D
```

## Common Commands

| Command | Description |
|---------|-------------|
| `hugo server -D` | Start dev server (includes drafts) |
| `hugo server` | Start dev server (published only) |
| `hugo` | Build static site to `public/` |
| `hugo new posts/my-post.md` | Create new blog post |

## Writing Posts

1. Create a new post:
   ```bash
   hugo new posts/my-new-post.md
   ```

2. Edit `content/posts/my-new-post.md`:
   ```yaml
   ---
   title: "My Post Title"
   date: 2024-12-15
   draft: false          # Set to false to publish
   tags: ["tag1", "tag2"]
   summary: "Brief description"
   ---
   
   Your content here...
   ```

3. Preview at http://localhost:1313

## Project Structure

```
.
├── content/
│   ├── about.md          # About page
│   └── posts/            # Blog posts
├── static/
│   ├── pics/             # Images
│   ├── works/            # Papers (PDFs)
│   └── resume/           # Resume files
├── hugo.yaml             # Site configuration
└── themes/PaperMod/      # Theme (git submodule)
```

## Deployment

The site auto-deploys to GitHub Pages via GitHub Actions on push to `main`/`master`.

To set up:
1. Go to repo **Settings → Pages**
2. Under "Build and deployment", select **GitHub Actions**

## Configuration

Edit `hugo.yaml` to customize:
- Site title and description
- Social links
- Menu items
- Theme settings

## Resources

- [Hugo Documentation](https://gohugo.io/documentation/)
- [PaperMod Wiki](https://github.com/adityatelange/hugo-PaperMod/wiki)

