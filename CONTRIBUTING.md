# Contributing to `@anter/ai-chat-sdk`

Thank you for your interest in contributing. This document covers everything you need to get started — from setting up a local development environment to opening a pull request.

---

## Table of contents

- [The agnostic contract](#the-agnostic-contract)
- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Making changes](#making-changes)
- [Testing](#testing)
- [Code style](#code-style)
- [Commit messages](#commit-messages)
- [Opening a pull request](#opening-a-pull-request)
- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)

---

## The agnostic contract

**This is the most important rule in this codebase.** The SDK is 100% industry-agnostic by design — it works equally for legal, finance, healthcare, customer support, GRC, or any other vertical. The core (`src/`) must never contain domain-specific concepts.

Before writing any code, ask yourself:

- Does my change introduce a term that only makes sense in one industry (e.g. `frameworkId`, `rfpMode`, `compliance`, `audit`, `vendor`)?
- Does any new UI string address the user as if they work in a specific domain?
- Would a developer building a legal tech product be confused about why this exists?
- Does any new config option only make sense for one vertical?

If any answer is "yes", redesign the change. If you're unsure, open an issue first and describe the use case — we're happy to help find a generic solution.

The only file allowed to contain domain-specific logic is `src/adapters/askinfosec-adapter.ts`. Everything else must be generic.

---

## Ways to contribute

- **Bug fixes** — If you found a bug and can reproduce it reliably, a fix is always welcome. Open an issue first for anything non-trivial so we can align on the approach.
- **New plugin slots** — If you need a new injection point in the SDK's surfaces, open a feature request. Slots must be position-descriptive and domain-agnostic (e.g. `headerActions`, `emptyStateFooter`).
- **New extension points** — If your use case cannot be served by the current `ChatAdapter` interface, slash command registry, artifact registry, or plugin slots, propose a new generic extension point.
- **Documentation improvements** — Fixes to README examples, typos, or missing documentation are always welcome without opening an issue first.
- **Tests** — Untested code paths are fair game. New tests for existing behavior that aren't covered are a great first contribution.

If you're planning a large change, open an issue first. A quick alignment check before you write code saves everyone time.

---

## Development setup

### Prerequisites

- **Node.js** 20 or later
- **pnpm** 9 or later (the build scripts use `pnpm`)

```bash
npm install -g pnpm
```

### Fork and clone

```bash
# Fork on GitHub, then:
git clone https://github.com/YOUR_USERNAME/ai-chat-sdk.git
cd ai-chat-sdk
```

### Install dependencies

```bash
pnpm install
```

### Build

```bash
pnpm build       # Production build (clean → tsup → type declarations → copy CSS)
pnpm dev         # Watch mode — recompiles on every save
```

### Verify everything works

```bash
pnpm check-all   # Runs format check → lint → type check → build in sequence
```

All four steps must pass before opening a PR.

---

## Project structure

```
src/
  headless/
    context/     # ChatProvider and ChatStateProvider context
    hooks/       # useChat, useArtifacts, useSources, useChatContext, …
    types/       # All TypeScript interfaces and types
    utils/       # Pure utility functions
  ui/
    composer/    # Message input area
    messages/    # Message list and individual message bubbles
    shell/       # ChatShell — full-page layout with sidebar and panels
    widget/      # ChatWidget — floating popover
    artifact-panel/
    sources-panel/
    command-palette/
    empty-state/
    …
  adapters/      # AskInfosecAdapter (domain-specific; isolated here on purpose)
  styles/        # Pre-built CSS (ais-* prefix throughout)
  extensions/    # Slash command and command palette registries
  index.ts       # Main barrel export
```

The layered entry points map directly to source directories:

| Entry point                   | Source                        |
| ----------------------------- | ----------------------------- |
| `@anter/ai-chat-sdk`          | `src/index.ts`                |
| `@anter/ai-chat-sdk/headless` | `src/headless/index.ts`       |
| `@anter/ai-chat-sdk/adapters` | `src/adapters/index.ts`       |
| `@anter/ai-chat-sdk/types`    | `src/headless/types/index.ts` |

---

## Making changes

### Adding a new feature

1. **Types first** — define interfaces in `src/headless/types/`
2. **Logic** — implement state and side-effects in a hook under `src/headless/hooks/`
3. **UI** — build the component in `src/ui/<feature>/`
4. **Exports** — add to `src/index.ts` (UI) and/or `src/headless/index.ts` (hooks/types)
5. **Tests** — add a `*.spec.ts` / `*.spec.tsx` file adjacent to the source

### Adding a new plugin slot

New slots go in `src/headless/types/plugins.ts`. Slot names must describe **position**, not purpose:

```typescript
// Good — describes where
composerActions?: React.ReactNode;
headerActions?: React.ReactNode;
emptyStateFooter?: React.ReactNode;

// Bad — describes domain intent (violates agnostic contract)
rfpControls?: React.ReactNode;
complianceActions?: React.ReactNode;
```

Then render the slot in the appropriate UI component and document it in `README.md`.

### Modifying the `ChatAdapter` interface

The `ChatAdapter` interface is a public API that all consumers implement. Any breaking change requires a major version bump. Adding optional methods is non-breaking.

### Modifying styles

All styles use the `ais-` prefix. `ChatProvider` renders a `[data-chat-provider]` wrapper — all SDK selectors should be scoped to it. Do not introduce new runtime style dependencies (no Tailwind runtime, no CSS-in-JS).

---

## Testing

```bash
pnpm test          # Run all tests once
pnpm test:watch    # Watch mode
```

Tests live in `*.spec.ts` / `*.spec.tsx` files adjacent to their source. The test setup uses Jest with `ts-jest`.

All new code paths need tests. At minimum: a success case and at least one error/edge case.

---

## Code style

- **TypeScript** — explicit types preferred; avoid `any`
- **Imports** — use `import type { … }` for type-only imports
- **Formatting** — single quotes, 2-space indent, trailing commas (enforced by Prettier)
- **Comments** — only when the **why** is non-obvious; don't explain what the code does

Prettier and ESLint handle enforcement automatically:

```bash
pnpm format    # Auto-fix formatting
pnpm lint      # Check linting
pnpm type-check
```

---

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add emptyStateFooter plugin slot
fix: prevent duplicate slash command registration on hot reload
docs: add ChatWidget fullChatUrl example to README
test: cover context_required SSE event parsing
refactor: extract useScrollPin into useStickyBottom
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.

Keep the subject line under 72 characters. Add a body if the motivation isn't obvious from the diff.

---

## Opening a pull request

1. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes and add tests.
3. Run `pnpm check-all` — all steps must pass.
4. Push your branch and open a PR against `main`.
5. Fill out the PR template checklist, especially the agnostic contract section.

PRs that touch the public API (`ChatAdapter`, `ChatConfig`, `ChatStrings`, `ChatPlugins`) must update `README.md` in the same PR.

---

## Reporting bugs

Use the [Bug report](.github/ISSUE_TEMPLATE/bug_report.yml) issue template. Include:

- SDK version (`npm ls @anter/ai-chat-sdk`)
- React version
- A minimal reproduction (a codesandbox or a short code snippet is ideal)
- What you expected vs. what you got

---

## Requesting features

Use the [Feature request](.github/ISSUE_TEMPLATE/feature_request.yml) issue template. Describe the **use case** first — not the implementation. A clear problem statement makes it much easier to design a generic solution that works for many consumers, not just one domain.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
