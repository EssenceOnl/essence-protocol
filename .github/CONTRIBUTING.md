# Contributing to Essence

Thanks for taking an interest. This guide keeps contributions easy to review.

## Ground rules

- Be respectful. Keep discussion focused on the work.
- Keep changes small and single-purpose.
- Do not include secrets, private keys or personal data in any commit, issue or pull request.
- Report security problems privately. See [SECURITY](SECURITY.md).

## What is welcome

- Bug fixes and accessibility improvements
- Performance and mobile polish
- Documentation fixes and clarifications
- Tests and verification for data handling

Open an issue before starting anything large so the direction can be agreed first.

## Principles the project holds to

- **Read-only site.** No wallet connection, signing or key handling in the public site.
- **Say what is unknown.** Missing data is shown as missing. Do not invent numbers.
- **Inert until stated.** Contract, staking and social elements stay disabled until officially announced.
- **Colour comes from the palette.** No stray colour values. Tokens come from the sampled palette.
- **External data is text.** Never insert data from outside sources as HTML.

## Setup

Requires Node.js 20 or newer.

```bash
npm install
npm run build
npm run gates
```

Both commands should succeed before you open a pull request.

## Pull requests

1. Fork the repository and create a branch from the default branch.
2. Make your change with a clear scope.
3. Run the build and the gates.
4. Describe what changed and why, and include a screenshot for visual changes at desktop and phone width.
5. Link the related issue if there is one.

Pull requests that break the gates, add dependencies without a clear reason, or weaken the principles above will be asked to change.

## Commit messages

Use a short imperative summary, for example `Fix pairs table overflow on small screens`. Add detail in the body when the reason is not obvious.

## Code style

Match the surrounding code: naming, comment density and formatting. Prefer small pure functions for data logic so they can be tested with fixtures.

## Licensing

By contributing you agree that your work is released under the [MIT License](../LICENSE).
