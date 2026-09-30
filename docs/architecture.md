# Architecture

This document covers how the public site works today and how the protocol pieces are expected to fit around it. Parts that are not built yet are labelled as planned.

## 1. Overview

```
Browser
  ├── Robinhood Chain RPC   block, gas, chain id, balances
  ├── DefiLlama             chain TVL history
  └── DexScreener           pairs, price, liquidity, volume
```

The site is a static bundle. There is no application server, database or account system. Every live value is fetched from a public source directly in the visitor's browser.

## 2. Site

### Pages
- **Home.** Narrative, live summary tiles and pairs.
- **Dashboard.** Chain tiles, TVL chart, recent blocks, pairs, wallet check, and a gated workforce section.
- **Stake.** Disabled controls behind a gate until contracts are stated.

### Build
A small Node pipeline with no framework:

1. **Asset sampling.** Reads the logo and reference images, runs k-means over their pixels, and snaps each colour token to a real pixel. Provenance is recorded in `palette.json`.
2. **Icon generation.** Derives favicons and the nav mark from the logo with a premultiplied resize, so transparent regions stored as black never darken edges.
3. **Assembly.** Copies the source to `dist/` and inlines shared header and footer partials into each page.
4. **Verification.** A gate suite checks the output: structure, palette provenance, contrast, icon integrity, read-only behavior, data helpers on synthetic fixtures, and size budgets.

### Runtime modules
- `lib`: pure helpers. Formatting, RPC batching, sources' response parsing, sparkline geometry and a poller. Network and timers are injected so they can be tested on a fast clock with fixtures.
- `main`: DOM wiring. Number count-up, reveal on scroll, chart hover, block bars, pairs table, wallet check and the contract slot.
- `config`: the single place for the contract address, social links, chain settings and poll intervals.

### Refresh cadence
Chain data refreshes every 8 seconds. TVL and pairs refresh every 60 seconds. Failed requests show an explicit state and are retried on the next tick.

## 3. Data handling

- Values from external sources are written to the page as text, never as HTML.
- Outbound pair links are accepted only for the expected DexScreener host.
- Wallet inputs are validated as a full address before any request is made.
- The site requests only read methods: block number, gas price, chain id, block by number, balance, transaction count and code.

## 4. Inert-until-stated

The contract slot, chart and explorer links, social icons and staking controls are all driven by empty values in `config`. While a value is empty the element is disabled and carries no link. Setting the value enables it. No date is shown for an absent item.

## 5. Protocol (planned)

The protocol pieces are not yet published. The intended shape:

- **Token.** A fungible token on Robinhood Chain representing a share of the workforce.
- **Activity and fee accounting.** A public record linking agent activity to fees generated.
- **Distribution.** A rule-based path from fees to holders, readable on-chain.
- **Staking.** Optional, with rules stated before it is enabled.

Each piece will be documented here with its addresses, permissions and review status when it is published.

## 6. Security posture

- No secrets in the repository or the bundle.
- No wallet connection or signing in the public site.
- Static hosting only, with a small surface to attack.
- Contract code, once published, will be public and reviewed before staking is enabled.

See [SECURITY](../.github/SECURITY.md) for how to report an issue.
