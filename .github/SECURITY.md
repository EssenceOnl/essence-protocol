# Security Policy

## Reporting a vulnerability

Please report security issues privately. **Do not open a public issue or pull request** for a vulnerability.

Use GitHub's private vulnerability reporting on this repository (the **Security** tab, then **Report a vulnerability**). If that is unavailable, contact the maintainers through the official channels listed in the [README](../README.md) once they are announced.

Include:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- The affected page, file or version
- Any suggested fix

## What to expect

- Acknowledgement of your report as soon as a maintainer can review it
- An assessment and, where valid, a fix and a public note once it is safe to share
- Credit for the finding if you want it

Please give us reasonable time to fix an issue before disclosing it.

## Scope

In scope:

- The public site at essence.onl and this repository
- The build and verification scripts
- Published smart contracts, once they exist

Out of scope:

- Third-party services the site reads from (the Robinhood Chain RPC, DefiLlama, DexScreener)
- Social engineering or physical attacks
- Denial of service through volume
- Findings that need a compromised device or browser

## Safe testing

- Do not access or modify data that is not yours.
- Do not run tests that degrade the service for others.
- Do not test against third-party infrastructure.

## Design notes relevant to security

- The public site is static, read-only, and has no wallet-connect or signing code.
- The repository must not contain private keys, seed phrases or other secrets. If you find one, report it here privately.
- Values from external sources are rendered as text, never as HTML.

## Impersonation

The contract address and official links are published only in this repository and on essence.onl once stated. Treat any other source as unverified, and never share a seed phrase or private key with anyone claiming to represent the project.
