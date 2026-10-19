# usama1002.github.io

Personal academic website, built on the [Academic Pages](https://github.com/academicpages/academicpages.github.io) Jekyll template (a fork of [Minimal Mistakes](https://mmistakes.github.io/minimal-mistakes/)).

## Structure

- `_config.yml` - site-wide settings, sidebar bio, and social links.
- `_pages/about.md` - home page bio.
- `_pages/experience.md`, `education.md`, `honors.md`, `skills.md` - one page per CV section, linked from the top menu (`_data/navigation.yml`). Service entries are at the bottom of the Experience page.
- `_publications/` - one Markdown file per paper or patent. Front matter fields:
  - `category`: `manuscripts` (journal articles), `conferences`, `underreview`, or `patents` - controls which section it appears in on `/publications/`.
  - `paperurl`, `arxivurl`, `codeurl`, `videourl`, `slidesurl`, `bibtexurl` - optional links shown under the citation.
- `_data/news.yml` - the News column on the home page, newest first. Each item has a `date` (e.g. "Sep 2026") and a one-sentence Markdown `text`. Add `pub: <publication slug>` to show that paper's [Paper], [arXiv] and [Code] links (whichever exist) automatically, or `links:` (label/url pairs) for non-paper items. The column scrolls, so older items can stay.
- `files/Muhammad-Usama-CV.pdf` - downloadable PDF CV (a website-specific build), linked from the home and Experience pages.
- `images/profile.jpg` - sidebar photo.
- `assets/js/seoul-city.js` - the animated pixel-art Seoul strip fixed along the bottom of the home page (drawn entirely in code, no image assets). It is enabled by `seoul_city: true` in a page's front matter, included via `_includes/seoul-band.html` and styled in `_sass/layout/_seoul.scss`. It shows the day city in the light theme and the night city in the dark theme; the trees follow the season in Seoul. Preview overrides: `?time=night` and `?season=spring|summer|autumn|winter`.

## Project pages

A publication can have a full project page instead of the default single-paper layout. Set `layout: project` in its front matter and write the page body as HTML (name the file `.html` so it is not run through Markdown). `_layouts/project.html` is a standalone layout without the sidebar; it follows the site's light/dark theme setting, and per-page `project_css`, `project_js` and `og_image` front matter fields load the page's own assets. The NeurIPS 2026 paper (`_publications/2026-01-01-graph-guided-layer-fusion-neurips.html`) is the first one; its styles, script, CKA matrices and figure live in `assets/fcm/`.

## Adding a new publication

Copy an existing file in `_publications/`, rename it `YYYY-MM-DD-slug.md`, and update the front matter and citation. It will automatically appear on the Publications page.

## Local development

Requires Ruby and Bundler, or Docker:

```bash
docker run --rm -v "$(pwd)":/srv/jekyll -w /srv/jekyll -p 4000:4000 jekyll/jekyll:latest \
  bash -c "bundle install && bundle exec jekyll serve --host 0.0.0.0"
```

Then open http://localhost:4000/.

GitHub Pages rebuilds the live site automatically on every push to `main`.
