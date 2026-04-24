# Nostr Stock Updater

A PWA for quickly updating stock on your Nostr NIP-99 classified listings (kind 30402).

## What it does

- Sign in with a NIP-07 browser extension, nsec, or bunker
- Tap product images to add or remove stock in bulk
- Publishes updated events with the **same `d` tag** — relays replace the prior version automatically
- Installable PWA (service worker, offline shell cache, home-screen icon)

This app does **not** create new listings — it only edits ones you already have.

## Built with

- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- [TailwindCSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Nostrify](https://nostrify.dev/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [MKStack](https://soapbox.pub/mkstack) (scaffolding)

## Getting started

**Prerequisites:** Node.js v18+ and a NIP-07 extension ([Alby](https://getalby.com) or [nos2x](https://github.com/fiatjaf/nos2x)).

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Build

```bash
npm run build
```

## License

MIT
