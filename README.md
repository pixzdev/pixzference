<div align="center">

# ⚡ Pixzference

**A themeable, motion-rich, security-hardened AI gateway for multi-provider LLMs.**

One endpoint for all your AI providers — now with a beautiful, customizable face.

*Fork of the amazing [OmniRoute](https://github.com/cheaper-inference/OmniRoute) (MIT), reimagined with a design system of its own.*

</div>

---

## ✨ What makes Pixzference different

### 🎨 A design system of its own
- **9 themes** — OmniRoute Lime (default), Ember, Aurora, Neon, Matrix, Rosewood, Ocean, Candy, Mono Ink — switchable live from **Settings → Appearance**, no reload
- **3 layout densities** — Compact / Cozy / Spacious for small laptops, default comfort, and big 4K displays
- **3 corner styles** — Sharp / Soft / Round
- **Motion engine** — page transitions, staggered card reveals, hover glow, shine sweeps, glass panels, animated gradient text, aurora login backdrop, animated logo
  - Fully respects `prefers-reduced-motion` **and** ships a manual Motion on/off switch (WCAG 2.3.3)
- **Any viewport** — phones, tablets, laptops, ultrawide: fluid type via `clamp()`, touch targets never below 40px, PWA installable
- Everything persists per-browser (localStorage) and applies before first paint (zero flash)

### 🔒 Security-first
Pixzference ships the full OmniRoute security surface **plus** hardening defaults:
- JWT session signing with a strong auto-generated secret (never a placeholder)
- Login rate-limiting with lockout, CSRF protection, secure cookies
- `INITIAL_PASSWORD` bootstrap — set your password from the environment, change it in-app
- API keys with per-key scoping, request logging, audit trail
- Full security documentation in [SECURITY.md](SECURITY.md)

### ☁️ Serverless-ready persistence
- Deploy to Vercel (or any serverless host) without losing data: versioned, gzip-compressed snapshot sync to **Neon Postgres** via `DATABASE_URL`
- Cold starts rehydrate from the latest committed snapshot; tracked writes schedule a debounced flush
- Large append-only tables (logs, usage history, caches) are intentionally excluded — snapshots stay small and fast
- Zero native database drivers — pure HTTPS through the official Neon serverless driver
- Strictly opt-in and fail-safe: if Neon is unreachable the gateway keeps running on local storage

### 🚀 Everything OmniRoute has
375+ providers, RTK+Caveman compression, auto fallback, MCP/A2A, desktop, PWA, OpenAI-compatible APIs — all of it, untouched and compatible.

## 🚀 Quick start

```bash
# 1. Install
npm install

# 2. Configure secrets (required on first run)
cp .env.example .env
#    → set JWT_SECRET, API_KEY_SECRET, INITIAL_PASSWORD

# 3. Run
npm run dev
```

Open http://localhost:3000 and sign in with your `INITIAL_PASSWORD`.

### Deploy to Vercel + Neon Postgres

The repo ships a [`vercel.json`](vercel.json) that builds a lean, serverless-friendly bundle (`next build`, no standalone assembly):

```bash
# Vercel → Add New → Project → import this repo
#   Environment variables:
#     JWT_SECRET        = openssl rand -base64 48
#     API_KEY_SECRET    = openssl rand -hex 32
#     INITIAL_PASSWORD  = your dashboard password (change it in-app after first login)
#     DATABASE_URL      = postgresql://…your-neon-host…/neondb?sslmode=require
```

On serverless hosts the filesystem is ephemeral, so point `DATABASE_URL` at a [Neon](https://neon.tech) Postgres project: Pixzference automatically round-trips its important tables (provider connections, API keys, settings, combos, budgets) through versioned, compressed snapshots — every cold start rehydrates from Neon, and every tracked write schedules a debounced flush.

Or any Docker host:

```bash
docker build -t pixzference .
docker run -p 3000:3000 \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e API_KEY_SECRET=$(openssl rand -hex 32) \
  -e INITIAL_PASSWORD='change-me' \
  -e DATA_DIR=/var/data \
  pixzference
```

## 🎭 Theming

Themes are pure CSS token re-points (`src/app/pixz.css`) — every Tailwind utility keeps working:

```css
/* Your own theme in 10 lines */
:root[data-pixz-theme="sunset"] {
  --ci-color-accent: #ff6b4a;
  --ci-color-accent-hover: #ff8a6d;
  --ci-color-accent-foreground: #2b0d05;
  --pixz-glow: 255, 107, 74;
}
```

Then register it in `src/store/pixzSettingsStore.ts` → `PIXZ_THEMES`.

## 📚 Documentation

- [OmniRoute upstream docs](https://github.com/cheaper-inference/OmniRoute) — provider setup, APIs, CLI
- [SECURITY.md](SECURITY.md) — security policy and hardening guide
- [CHANGELOG.md](CHANGELOG.md) — upstream changelog

## 🙏 Credits & license

- **Pixzference** modifications: MIT — Copyright (c) 2026 Pixz
- **OmniRoute** upstream: MIT — Copyright (c) cheaper-inference & contributors
- All upstream third-party notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

Pixzference is an independent fork that keeps full compatibility with OmniRoute and gladly merges upstream improvements.
