# usama1002.github.io

Personal academic website, built on the [Academic Pages](https://github.com/academicpages/academicpages.github.io) Jekyll template (a fork of [Minimal Mistakes](https://mmistakes.github.io/minimal-mistakes/)).

## Structure

- `_config.yml` - site-wide settings, sidebar bio, and social links.
- `_pages/about.md` - home page bio.
- `_pages/experience.md`, `education.md`, `honors.md`, `skills.md` - one page per CV section, linked from the top menu (`_data/navigation.yml`). Service entries are at the bottom of the Experience page.
- `_publications/` - one Markdown file per paper or patent. Front matter fields:
  - `category`: `manuscripts` (journal articles), `conferences`, `underreview`, or `patents` - controls which section it appears in on `/publications/`.
  - `paperurl`, `codeurl`, `videourl`, `slidesurl`, `bibtexurl` - optional links shown under the citation.
- `files/Muhammad-Usama-CV.pdf` - downloadable PDF CV (a website-specific build), linked from the home and Experience pages.
- `images/profile.jpg` - sidebar photo.

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
