<div align="center">

# ESSENCE

**Everyone has a place.**

Own a share of the AI workforce. A network of autonomous agents that work, earn and generate value around the clock, on Robinhood Chain.

[essence.onl](https://essence.onl) · [Whitepaper](docs/whitepaper.md) · [Architecture](docs/architecture.md) · [Roadmap](docs/roadmap.md)

</div>

---

## Overview

Autonomous AI agents do not clock out. They can run continuously, handle tasks, interact with markets and produce economic activity without working hours. Essence connects that activity to an on-chain economic system where fees are generated and value is distributed across the network, so anyone can hold a share of the workforce without operating a fleet of their own.

This repository holds the public site at [essence.onl](https://essence.onl), the documentation, and the tooling used to build both.

## At a glance

| | |
|---|---|
| Network | Robinhood Chain |
| Chain ID | `4663` |
| RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Explorer | https://robinhoodchain.blockscout.com |
| Site | https://essence.onl |

## Contract

| | |
|---|---|
| Token contract | **Not stated yet** |

The contract address is published here and on the site only once it is officially announced. Treat any address presented elsewhere before that as unverified.

## Social

| | |
|---|---|
| X | Not announced yet |
| GitHub | This repository |

Links are added here and on the site once they are official.

## What the site does

- **Live chain view.** Block height, gas, block time, recent block activity and chain TVL, read directly in the browser from the public RPC and DefiLlama.
- **Pairs.** The most liquid pairs on Robinhood Chain from DexScreener, narrowing to the Essence contract once it is stated.
- **Wallet check.** Paste any address to read its balance and activity. Read-only.
- **Inert until stated.** The contract slot, staking and social links stay inactive until they are announced.

The site is read-only by design. It has no wallet-connect code, asks for no signatures and holds no keys.

## Repository layout

```
docs/          Whitepaper, tokenomics, roadmap, architecture
.github/       Contributing guide and security policy
src/           Site source
scripts/       Asset sampling, build and verification
brand/         Logo files
reference/     Visual and copy reference
```

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm run gates
```

`build` samples the brand assets, generates the palette and icons, and writes the static site to `dist/`. `gates` runs the verification suite against the build.

## Documentation

- [Whitepaper](docs/whitepaper.md): the protocol idea and vision
- [Tokenomics](docs/tokenomics.md): token structure, and what is and is not yet stated
- [Roadmap](docs/roadmap.md): development phases
- [Architecture](docs/architecture.md): how the site and the protocol pieces fit together

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING](.github/CONTRIBUTING.md) first. To report a vulnerability, follow [SECURITY](.github/SECURITY.md) and do not open a public issue.

## Disclaimer

Essence is an independent project and is not affiliated with Robinhood. Nothing in this repository is investment advice or a promise of returns. Figures shown on the site come from public sources and can be delayed or wrong. Do your own research.

## License

[MIT](LICENSE)
