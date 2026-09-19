---
name: html-css-developer
description: Read this when making HTML templates/files or CSS/SCSS styling changes. Covers the design philosophy, color/variable conventions, layout patterns, shared component styling conventions, and common pitfalls.
---

# HTML & CSS Developer Skill

> [!CAUTION]
> **REUSE EXISTING STYLES — DO NOT RECREATE THEM**
>
> Before writing any new CSS, check the project's global stylesheet (e.g. `src/styles.scss`) and variables file (e.g. `src/scss_variables.scss`) for existing classes and variables. Shared UI patterns — **buttons**, **chips**, **cards**, **menus**, **inputs**, **search boxes**, and **error containers** — should be defined once globally. If a global class exists for what you need, use it directly in the HTML — do not redefine it locally in a component's stylesheet.
>
> If you need a new shared style, add it to the global stylesheet or variables file — not in a component file. Component styles should only contain **layout and positioning** specific to that component.

## 1. Design Philosophy

The aesthetic priorities are:

1. **Clarity over decoration**: Clean layouts, readable typography, moderate whitespace.
2. **Restrained palette**: Crisp neutral (black/white/grey) surfaces, a single strong brand accent color for headings and primary call-to-action buttons, and a light, subtle highlight color for interactive states (hover, selection). Positive call-to-action buttons use the brand accent with white text — **never solid black backgrounds**.
3. **Subtle depth**: Light box-shadows and border-based separation rather than heavy gradients.
4. **Responsive simplicity**: Grid/flexbox layouts that collapse gracefully at 600px. No complex responsive breakpoint system — just a single mobile breakpoint.
5. **Reuse global styles**: Shared UI patterns are defined once globally. Component styles only handle layout and component-specific positioning.

---

## 2. Core Files

Keep styling split into a small number of shared files:

| File | Purpose |
| --- | --- |
| Variables file (e.g. `src/scss_variables.scss`) | All SCSS variables (colors, spacing, shadows) and shared mixins |
| Global stylesheet (e.g. `src/styles.scss`) | Global styles: buttons, inputs, chips, menus, cards, errors |
| Shared layout partials (e.g. `edit-form.scss`) | Layouts reused across several pages (e.g. forms) |

### Importing Variables and Styles

```scss
// Standard import pattern for component SCSS files:
@use "../../scss_variables" as *;    // Access all SCSS variables
@use "../../styles" as *;            // Access global classes (needed for @extend)

// Or with a namespace:
@use "../../scss_variables" as v;    // Access via v.$variable-name
```

---

## 3. Color Palette

All colors are defined as SCSS variables in the variables file. **Always use the variable name**, never hardcode a hex value that already has a variable.

### Suggested Variable Groups

| Group | Example variables | Used For |
| --- | --- | --- |
| **Brand / Theme** | `$theme-bg-color`, `$theme-border-color`, `$heading-accent-color` | Header, footer, headings, card backgrounds |
| **Buttons** | `$button-bg-color`, `$button-border-color`, `$button-text-color`, `$button-hover-bg-color`, `$button-active-bg-color` | All `<button>` element states |
| **Shadows** | `$shadow-color`, `$shadow-color-hover`, `$shadow-color-active` | Box-shadow on buttons, cards |
| **Chips / Tags** | `$theme-chip-bg-color`, `$theme-chip-border-color`, `$theme-tag-bg-color` | Small labelled badges |
| **Text** | `$text-primary`, `$text-secondary`, `$text-muted`, `$text-placeholder` | Heading, body, label, and metadata text |
| **Borders** | `$border-color-light`, `$separator-color` | Input borders, card outlines, dividers |
| **Errors** | `$theme-error-text-color`, `$theme-error-bg-color`, `$theme-error-border-color` | Error containers |
| **Focus** | `$focus-ring-color` | Input focus rings, active tab indicators |
| **Lists** | `$row-border-color`, `$row-highlight-bg`, `$row-highlight-border` | Row borders, hover/selection highlighting |
| **Layout** | `$max-main-width`, `$card-padding`, `$card-sep` | Content width caps, card spacing |

---

## 4. Typography

- Use a simple system font stack (e.g. `Arial, Helvetica, sans-serif`) set once on `body`.
- Use `monospace` for identifiers, emails, tags, and timestamps.
- Prefer relative sizes (`em`, `rem`, `small`, `large`).
- Set heading colors globally — do not redefine heading colors in component styles.

---

## 5. Layout Patterns

### App Shell

```
┌─────────────────────────────┐
│  header / nav bar           │
├─────────────────────────────┤
│         main                │  ← max-width: $max-main-width, centered, padding: 0 1em
│    ┌───────────────────┐    │
│    │  page content     │    │
│    └───────────────────┘    │
├─────────────────────────────┤
│  footer                     │
└─────────────────────────────┘
```

- App container: `display: flex; flex-direction: column; min-height: 100vh`
- `main`: `max-width: $max-main-width`, `margin: 0 auto`, `padding: 0 1em`, `flex-grow: 1`
- **All page content is automatically width-constrained by `main`.** Do NOT add `max-width: $max-main-width` to individual components or wrapper divs — it is redundant and inconsistent.
- **No Back Buttons in Body**: Never include "Back" buttons or links inside the body of a page when the navigation bar / breadcrumbs handle view navigation.
- **No Repeating Header Titles**: Never repeat the view title as an `<h1>` or large banner in the body when the navigation bar already displays it. Only use subtitles or explanatory notes if they convey meaningful, actionable information.

### Common Page Layouts

1. **Default** — just render content directly. `main` handles the max-width constraint.

2. **Full-stretch list** (host/container as flex column):
   ```scss
   :host {
     display: flex;
     flex-direction: column;
     justify-content: start;
     align-items: stretch;
     flex-grow: 1;
   }
   ```

3. **Cards grid** (auto-fill with minmax):
   ```scss
   .cards-grid {
     display: grid;
     grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
     gap: 1rem;
   }
   ```

### Flexbox Patterns

```scss
// Row with centered items and wrapping
.row {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 1em;
}

// Space-between actions bar
.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
```

### Grid Pattern (Forms)

Use a two-column grid for label/input pairs:

```scss
.form-section {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px 20px;
  align-items: start;

  h3 { grid-column: 1 / -1; }    // Headings span full width
  p  { grid-column: 1 / -1; }    // Paragraphs span full width

  @media (max-width: 600px) {
    grid-template-columns: 1fr;   // Stack on mobile
  }
}
```

---

## 6. Shared Component Conventions

### Buttons

Style all `<button>` elements globally. **Do not re-style buttons in component styles** — use a small set of global variant classes instead:

| Class | Purpose | When to Use |
| --- | --- | --- |
| _(no class)_ | Default button | Standard actions (Save, Submit) |
| `.primary-button` | Brand accent background, bold white text | High-priority CTAs (Pay, Checkout, Sign up) |
| `.icon-only-button` | Circular, transparent, icon-only | Dismiss, toggle, inline actions |
| `.round-button` | Fully circular with padding | Floating actions |
| `.delete-button` | Neutral by default, red on hover | Destructive actions |
| `.inline-link-button` | Looks like a dark text link (underlined) | Inline internal text references, "Show more"/"Show less" toggles |
| `.subtle-button` | Transparent with soft hover | Secondary / navigation actions |
| `.outlined-button` | Subtle button with dashed border | File upload triggers, optional selection inputs |

> [!IMPORTANT]
> If you find yourself writing `background-color`, `border`, `box-shadow`, or `border-radius` for a button in a component stylesheet, **stop** — you almost certainly should be using a global class instead. **Never introduce new custom button styles** in component styles.

> [!WARNING]
> **NO BLACK OR ARBITRARY BLUE BACKGROUNDS FOR PRIMARY CALL-TO-ACTION BUTTONS**
> Primary call-to-action buttons must use the `.primary-button` style: the brand accent color with bold white text.

> [!WARNING]
> **NO SPINNERS INSIDE BUTTONS (ANTI-PATTERN)**
> Do NOT place a spinner inside a `<button>` element. It disrupts button geometry and looks unpolished.
>
> **Standard Pattern**: When an action (e.g. Save, Submit) is in progress, **replace the action button(s)** with the spinner:
> ```html
> @if (isSaving()) {
>   <app-spinner>Saving changes...</app-spinner>
> } @else {
>   <button type="button" class="primary-button" (click)="save()">Save Changes</button>
> }
> ```

### Links

Enforce a **strict visual distinction** between external and internal links:

| Link Type | Visual Style | Implementation |
| --- | --- | --- |
| **External** (leaves the site) | **Blue** underlined text | Plain `<a href="https://..." target="_blank" rel="noopener noreferrer">` |
| **Internal** (navigates within the site/app) | Button/subtle-button, or **black** underline | `.subtle-button`, `.icon-only-button`, `.inline-link-button`, or a card-like pattern |

> [!CAUTION]
> **Blue text must NEVER be used for links that navigate within the site/app.** Blue underlined text is reserved exclusively for external links (`https://...`, `mailto:`, `tel:`, downloads, standalone static pages).

**Quick decision guide:**

- Is it a full row / card the user clicks? → Use a card class (e.g. `.selectable-card`)
- Is it a navigation action (view, go-to)? → `.subtle-button`
- Is it an inline icon action? → `.icon-only-button`
- Is it an inline text reference inside a sentence? → `.inline-link-button` (black underline, never blue)

Prefer real `<a href="...">` elements for navigation over `(click)` handlers that navigate programmatically — this keeps middle-click, hover previews, and other browser features working.

### Cards

Use a single global `.card` class (background, border, rounded corners, flex-column layout). Do not redefine card styles locally.

### Notes & Status Banners

Use one common note/banner style for informational callouts: a neutral light grey background, a light border, and a solid dark left accent stripe (e.g. `4px`), with an icon aligned beside a bold title and secondary description text.

### Pill Tabs

For in-page tab navigation, use a global pill-tab system: tabs sit on a tinted track; the active tab pops out with a white background and subtle shadow. **Do not define local tab styles in components.** Where possible, sync the active tab to a URL parameter so tabs are deep-linkable.

```html
<div class="pill-tabs">
  <button class="pill-tab" [class.active]="activeTab() === 'first'" (click)="setActiveTab('first')">First</button>
  <button class="pill-tab" [class.active]="activeTab() === 'second'" (click)="setActiveTab('second')">Second</button>
</div>
```

### Interactive List Rows (Row Highlight)

Use a standardised **row-highlight** pattern for clickable list items: a colored left-border accent with a light background on hover/selection. Build it from two mixins in the variables file:

| Mixin | Effect |
| --- | --- |
| `row-highlight-base` | Adds a 4px transparent left border with a smooth transition (background + border color) |
| `row-highlight-active` | Sets `background-color: $row-highlight-bg` and `border-left-color: $row-highlight-border` |

```scss
@use "../../scss_variables.scss" as v;

.item-row {
  display: block;
  border-bottom: 1px solid v.$row-border-color;
  @include v.row-highlight-base;
  cursor: pointer;
  text-decoration: none;
  color: inherit;

  &:hover {
    @include v.row-highlight-active;
  }
}
```

Apply both mixins unconditionally on a detail page header to make it look permanently "selected", visually connecting it back to the list the user came from.

### Chips

Define all chips globally (e.g. `.tag-chip`, `.identifier-chip`, `.email-chip`, `.missing-identifier-chip` with a dashed border, and `.active-tag-chip` + `.tag-clear-btn` for dismissible filter chips). Wrap multiple chips in a flex container with `flex-wrap: wrap` and a small `gap`.

> [!IMPORTANT]
> If you need a small rounded badge with a background color, it is almost certainly an existing chip class. Do not create a new one.

### Menus / Dropdowns

Provide global `.menu-style` (container with border, shadow, column flex), `.menu-item` (icon + label row, using the row-highlight pattern on hover/active), and `.menu-overlay` (full-screen click-away backdrop). Position a dropdown in a component by extending the base class:

```scss
@use "../../styles" as *;
.my-dropdown {
  @extend .menu-style;
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
}
```

> [!IMPORTANT]
> **Exclusive Selection**: Do NOT use checkboxes for exclusive (single) selection in menus. Checkboxes imply multi-select. Use an `.active` class on the selected item instead.

### Inputs

Style inputs globally: bottom border only, rounded corners, a sensible `max-width` (e.g. `30em`) with `flex-grow: 1`, and a clear disabled state.

### Error Containers

| Class | Purpose | When to Use |
| --- | --- | --- |
| `.error-container` | Full-width error block at form level | Save/submit failures, validation summaries |
| `.inline-error` | Compact dismissible error next to the trigger; hard-wraps long text | Upload failures, field-specific async errors |

---

## 7. Icons

Use a single icon system consistently (e.g. an `<app-icon name="...">` component wrapping inline SVG data using Material Icons naming). Do not mix raw SVGs, image tags, and icon components for the same purpose.

---

## 8. Responsive Design

Use **one primary breakpoint**: `max-width: 600px` (mobile).

```scss
@media (max-width: 600px) {
  .form-section { grid-template-columns: 1fr; }   // Grid collapses to single column
  .cards-grid { grid-template-columns: 1fr; }     // Cards go full-width
  .form-actions { flex-direction: column; align-items: flex-start; }
}
```

- **Grid collapse**: `grid-template-columns` goes from `auto 1fr` to `1fr`
- **Flex wrap**: Use `flex-wrap: wrap` on row containers
- **`max-width` constraints**: Content areas capped (e.g. `800px` or `1200px`)
- **No height/width: 100%** unless truly needed (prefer flexbox grow)

---

## 9. Transitions & Animations

Use **subtle, functional transitions** — not decorative animations:

```scss
// Standard hover/interaction transition
transition: all 0.2s ease-in-out;

// Input focus
transition: border-color 0.3s ease, box-shadow 0.3s ease;

// Card hover lift
transition: transform 0.2s, box-shadow 0.2s;
```

---

## 10. Common Pitfalls

### SCSS `@use` Does NOT Copy CSS Rules

`@use "../../styles" as *;` only makes **variables, mixins, and functions** available. It does **not** copy CSS class definitions into the component's stylesheet. If you need a global class:
- Define it in the global stylesheet (it will be globally available to all HTML)
- Or use `@extend .global-class` (which requires `@use` of the source file)

### `@extend` Requires `@use`

```scss
// ✅ Correct — class can be found and extended
@use "../../styles" as *;
.my-menu { @extend .menu-style; }

// ❌ Wrong — SCSS compiler error: ".menu-style does not exist"
.my-menu { @extend .menu-style; }
```

### Class Name Mismatches

With scoped component styles (e.g. Angular's emulated view encapsulation), a class in the HTML that doesn't match any class in the component's stylesheet **or** the global stylesheet has no effect. Always verify class names match.

### Default `<button>` Drop Shadow Trap

If the global `button` selector applies a default `box-shadow`, any `<button>` without an existing variant class (or with a custom component class) inherits it.
- For inline text triggers and fold/unfold actions ("Show more", "Show less"): use `.inline-link-button`.
- For padded subtle actions: use `.subtle-button`.
- Never invent a new button class in component styles.

### Avoid These

- ❌ `height: 100%` / `width: 100%` — prefer flexbox `flex-grow: 1` and `align-items: stretch`
- ❌ `@import` — always use `@use`
- ❌ `::ng-deep` — avoid unless absolutely necessary (e.g., styling third-party editor content)
- ❌ Inline styles — use classes
- ❌ `ngClass` / `ngStyle` — use native class/style bindings
- ❌ Custom button classes in component styles — use global button classes

---

## 11. Checklist for HTML/CSS Changes

Before submitting any styling change:

1. **Reuse first**: Does a global class already do what you need? (buttons, chips, cards, menus, inputs, errors, search boxes). If yes, use it — do not recreate it.
2. **Variables**: Are you using SCSS variables instead of hardcoding hex colors?
3. **No local button/chip styles**: If your component stylesheet contains `background-color`, `border-radius`, or `box-shadow` for a button or chip, you are almost certainly duplicating a global style.
4. **`@use` imports**: If you're using `@extend` or SCSS variables, did you add the `@use` import?
5. **Responsive**: Does the layout work at `max-width: 600px`? Did you add a `@media` query if needed?
6. **Flexbox**: Are you using `flex-wrap: wrap` on row containers that might overflow on small screens?
7. **Icons**: Are you using the project's icon system (not ad-hoc raw SVGs or image tags)?
8. **Transitions**: Did you add a `transition` for interactive state changes (hover, focus, active)?
9. **Class naming**: Are your class names descriptive and scoped to the component? (e.g. `.member-view-actions`, not `.actions`)
10. **No height/width 100%**: Prefer flex-based sizing.
11. **Positive action buttons**: Do CTA buttons use the brand accent `.primary-button` style, and NEVER solid black backgrounds?
12. **No accidental button drop-shadows**: Do inline text buttons, toggles, and secondary actions use `.inline-link-button` or `.subtle-button` rather than an unclassed `<button>` inheriting the global `box-shadow`?
13. **Links**: Are external links blue and underlined, and internal links never blue?
