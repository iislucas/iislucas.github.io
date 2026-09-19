---
name: generalist-project-developer
description: Always read this; it contains the general coding standards, tech-stack preferences, and best practices for this project, including pnpm (never npm or npx).
---

# Generalist Developer Guide

This guide details the general technology preferences, coding standards, and style conventions to follow in this project.

## 1. Agent Skills Directory

`.agent/skills/` contains skill files with targeted LLM guidance for this project (symlinked into `.claude/skills/`). Each skill is a directory with a `SKILL.md` using YAML frontmatter (`name:`, `description:`).

| Skill | When to read |
|---|---|
| [`generalist-project-developer`](.agent/skills/generalist-project-developer/SKILL.md) | Always read — coding standards, tech stack, best practices (this file) |
| [`html-css-developer`](.agent/skills/html-css-developer/SKILL.md) | When editing HTML or CSS/SCSS styles |
| [`angular-developer`](.agent/skills/angular-developer/SKILL.md) | When editing Angular components, templates, or routing |

**Adding a new skill**: create `.agent/skills/{skill-name}/SKILL.md` with frontmatter `name:` and `description:`, then populate it (and symlink it into `.claude/skills/`).
**Updating a skill**: edit the relevant `SKILL.md` directly whenever you discover something non-obvious worth preserving across sessions.

---

## 2. Core Technologies

- **Package Manager:** **pnpm**. Use `pnpm` (do NOT use `npm` or `npx`; use `pnpm exec` instead). Note that if you can't find the command, you may need to load `~/.zshrc` or `~/.bashrc` first.
- **Language:** **TypeScript**, with strict type checking.
- **Reactivity (when using Angular):** **Angular Signals** are the primary mechanism for state and reactivity; avoid Observables where possible.
- **Asynchronous Operations:** Prefer **async/await** (and Signals, in Angular). Use RxJS only when necessary.
- **HTML Styling:** **SCSS**. Use colors from the shared variables file. Import using `@use`.

---

## 3. Coding Style & Formatting

- **Formatter:** Prettier.
- **Indentation:** 2 spaces.
- **Quotes:** Single quotes (`'`) for all TypeScript code.
- **Whitespace:** Trim trailing whitespace and ensure a final newline.
- **Testing:** All new items should have a `.spec.ts` file with meaningful unit tests.
- **Styling:** Use SCSS for styling. Import using `@use`; avoid height and width of 100% unless really needed. Prefer flexbox and grid layouts.

### Page Layout & Navigation Conventions

- **No Back Buttons in Body**: Do NOT add "Back" buttons or links (e.g. `← All Products`, `← Back to Events`) inside the body of a page when a top navigation bar / breadcrumb hierarchy already provides structured navigation.
- **No Repeating Header Titles**: Do NOT repeat the view/page title as an `<h1>` or large header inside the body when the navigation bar already displays the active page title.
- **Subtitles & Explanations**: It is fine to include an explainer subtitle, but only if it says something meaningful and helpful (do NOT add redundant boilerplate text that merely restates the page name).

---

## 4. TypeScript Best Practices

- Use strict type checking.
- Prefer type inference.
- DO NOT USE `any` types; use appropriate types. Use `unknown` where appropriate.
- Prefer taking arguments that are existing object types rather than making special inline types for parts of an object. Types should capture the key conceptual components, and we should take these as arguments.
- Don't use explicit boolean === value checks. Just use the boolean value directly. e.g. don't use `if (isNew === true)` use `if (isNew)`.
- **Prefer TypeScript Enums Over String Literal Unions**: Whenever modeling fixed domain sets (e.g. roles, statuses, categories), use TypeScript `enum` with string values (e.g. `export enum AttendanceType { InPerson = 'in_person', ... }`). Avoid raw string literal unions (`'in_person' | 'online'`) and avoid comparing against raw string literals in code (`attendance === AttendanceType.Online`, not `attendance === 'online'`). Enums ensure type safety, refactoring support, and catch typos at compile time.
- **Centralize Names with Enums**: When the code refers to a fixed set of named things (database collections, storage paths, event names, etc.), define them once in an enum and use that everywhere instead of repeating raw string literals. This prevents typos and provides a single source of truth.
- **Early Domain Typing on External Data (Anti-Pattern: Late Untyped Bracket Access `data['field']`)**: When reading data from a database, API, or file, cast/parse it to its authoritative domain type as early as possible (e.g. `snap.data() as Member | undefined`). Never leave such data untyped or typed as `Record<string, unknown>`, and never access properties using index-signature bracket notation (`eventData['title']`). Early domain typing provides compile-time validation, IDE autocomplete, prevents typos, and enables clean dot-property access (`event.title`).
- **Type Update Accumulators with `Partial<T>`**: When building an update object (e.g. to pass to a database `update()`), type it as `Partial<DomainType>`. Never type update accumulators as `Record<string, unknown>`. Use dot notation (`updates.paymentStatus = ...`) to prevent typos in field names and ensure all values match the domain schema.

### Data Modeling

- **Avoid Partially Defined Objects**: For the main datatypes in a project, avoid partially defined or optional-field objects. Implement an `initObject()`-style constructor (providing default values for all properties) and a converter that merges stored/external data over the initialized defaults. This guarantees that application logic can assume defined values for all keys.
- **Always Type Writes (Anti-Pattern: Untyped Writes)**: Never pass untyped or loosely typed object structures (like `Record<string, unknown>`) to write operations (database `set()`/`update()`, API payloads, files). Always explicitly bind the payload to its corresponding domain model type first. This ensures type safety at write time and prevents corrupted or schema-violating records.

---

## 5. Testing

After adding or changing anything non-trivial, run `pnpm test` (or the specific test for the affected files) to ensure that things are not broken. Also when making changes consider if new tests should be added.

> [!IMPORTANT]
> **Build Verification**: Test coverage does not cover everything (e.g., template errors or complex type mismatches). After making changes and running tests, you **MUST** also run `pnpm build` (when the project has a build) to ensure it builds successfully and catches any errors missed by unit tests.

- Framework: `vitest`.
- Requirement: All new items should have a `.spec.ts` file with meaningful unit tests.
- Mocks: In tests, mocks should be treated as the type they intend to mock. Only when we initialise them may we use the `as never as TypeName` pattern if we cannot directly specify the `TypeName`. Do not use `any`.

---

## 6. Comments

- Comments should be provided for all aspects of a function's specification that are not obvious from types. e.g. if a function returns a string, the comment should explain what the string represents.
- All comments should be in **English**.
- Don't use `/** ... */` style comments. Use `//` for function and inline comments. Use `/* ... */` for multi-line comments.
- The header of every file should have a `/* ... */` comment describing the file and its purpose, and key aspects of how to use it. If the file is a script, the header comment should also include instructions on how to run it, with an example command line.

---

## 7. LLM Behavioral Guidelines

These guidelines bias toward caution over speed to reduce common LLM coding mistakes. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
