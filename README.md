# Foliokit

A developer portfolio template that works out of the box. Everything on the
public site is driven by one config file — no database, no backend, no
environment variables required.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:8889 and edit `portfolio.config.ts`. Your name, bio,
projects, socials, theme and typography all live there.

## Static export

```bash
npm run build
```

Produces a fully static site in `./out/` — deploy it to GitHub Pages,
Vercel, Netlify, Cloudflare Pages, or any static host.

## What the config controls

| Section                  | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| `name`, `title`          | Hero identity                            |
| `bio`, `experience`      | About page content                       |
| `defaultTheme`           | One of the 32 built-in themes            |
| `typographyPreset`       | One of 8 font pairings                   |
| `navLinks`               | Header navigation                        |
| `projects`, `showcase`   | Featured work                            |
| `blogPosts`              | Static markdown posts                    |
| `github.username`        | Live repo listing on `/projects`         |
| `socialLinks`, `contact` | Contact channels and form                |

## Commands

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `npm run dev`        | Dev server on port 8889        |
| `npm run build`      | Static export to `./out/`      |
| `npm run lint`       | ESLint                         |
| `npm run test`       | Vitest                         |

## License

MIT
