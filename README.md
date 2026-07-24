# Nostr Stock Updater

A PWA for quickly updating stock on your Nostr NIP-99 classified listings (kind 30402), with a built-in point-of-sale and Lightning checkout.

## What it does

### Inventory
- Sign in with NIP-07 browser extension, bunker, or by scanning a QR code with Amber (or any Nostr Connect signer)
- Tap product images to add or remove stock in bulk
- Publishes updated events with the **same `d` tag** — relays replace the prior version automatically
- Installable PWA (service worker, offline shell cache, home-screen icon)

### Point of Sale (POS)
- Build an order by tapping items from your own NIP-99 listings, in an image grid or a compact list view
- Search and sort your catalog (newest/oldest, name, price, stock level)
- Cart totals are converted to sats automatically, even across listings priced in different currencies (USD, EUR, GBP, CAD, CHF, AUD, JPY, SATS, BTC)
- Charge the order over Lightning using your own profile's lightning address (`lud16`) — no custodian, funds land directly in your wallet
- On confirmed payment, stock is automatically decremented and the updated listings are republished
- Optionally send the buyer a DM receipt (itemized, with total paid) as a private NIP-17 message

### Calculator
- A real calculator (+, −, ×, ÷) for ringing up an arbitrary amount
- Auto-detects your currency from your most commonly used listing price, converts to sats, and charges the same way as POS
- Also supports optional memos and DM receipts

### Payments
- Invoices are requested live via LNURL-pay (LUD-06/16) from your lightning address
- Automatically detects payment via LUD-21 `verify`, where supported, or lets you confirm manually ("I've been paid")
- WebLN wallets (browser extensions) can pay directly from the same device

#### Auto-detected payment support

Whether a sale is confirmed automatically depends on the lightning address (`lud16`) set on the **seller's** Nostr profile, not on the buyer's wallet. Auto-detect requires the seller's provider to support LUD-21 `verify`:

| Provider | Auto-detects payment? |
| --- | --- |
| [Coinos](https://coinos.io) | ✅ Yes |
| [LNbits](https://lnbits.com) | ✅ Yes |
| [BTCPay Server](https://btcpayserver.org) | ✅ Yes |
| [Blink](https://blink.sv) | ✅ Yes |
| [Alby](https://getalby.com) | ✅ Yes |
| [Wallet of Satoshi](https://www.walletofsatoshi.com) | ❌ No (manual confirm only) |
| Strike | ❌ No (manual confirm only) |

If your provider isn't listed, request an invoice from `https://<your-domain>/.well-known/lnurlp/<name>`, call its `callback` with an `amount`, and check whether the response includes a `verify` URL. Without one, the app falls back to a manual "I've been paid" button.

## Built with

- [React 18](https://react.dev/) + [Vite](https://vitejs.dev/)
- [TailwindCSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
- [Nostrify](https://nostrify.dev/)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools) (NIP-17/NIP-44/NIP-46 primitives)
- [qrcode.react](https://github.com/zpao/qrcode.react)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [MKStack](https://soapbox.pub/mkstack) (scaffolding)

## Getting started

**Prerequisites:** Node.js v18+ and a NIP-07 extension ([Alby](https://getalby.com) or [nos2x](https://github.com/fiatjaf/nos2x)).

To use the POS or Calculator tabs, your Nostr profile needs a lightning address (`lud16`) set — that's where payments are received.

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
