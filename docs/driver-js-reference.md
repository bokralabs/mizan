# driver.js Reference for Next.js Tours

## 1. Import Pattern (No SSR)

driver.js accesses `document` on import. Dynamic import is mandatory.

```tsx
// WRONG - breaks hydration
import { driver } from "driver.js";

// CORRECT - lazy load inside useEffect or async callback:
const { driver } = await import("driver.js");
// @ts-expect-error CSS import handled by webpack
await import("driver.js/dist/driver.css");
```

## 2. Complete Config Reference

From `driver.js.d.ts` -- every option on `Config`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `steps` | `DriveStep[]` | `[]` | Tour steps array |
| `animate` | `boolean` | `true` | Fade-in animations |
| `overlayColor` | `string` | `"black"` | Any CSS color |
| `overlayOpacity` | `number` | `0.5` | 0 = invisible overlay |
| `smoothScroll` | `boolean` | `false` | Smooth scroll to elements |
| `allowClose` | `boolean` | `true` | Backdrop click closes |
| `overlayClickBehavior` | `"close" \| "nextStep" \| DriverHook` | `"close"` | What backdrop click does |
| `stagePadding` | `number` | `10` | px gap around cutout |
| `stageRadius` | `number` | `5` | Cutout border radius |
| `disableActiveInteraction` | `boolean` | `false` | **true = highlighted element unclickable** |
| `allowKeyboardControl` | `boolean` | `true` | Arrow keys navigate |
| `popoverClass` | `string` | `""` | Added to `.driver-popover` |
| `popoverOffset` | `number` | `10` | Gap between popover and element |
| `showButtons` | `AllowedButtons[]` | `["next","previous","close"]` | `[]` hides all buttons |
| `disableButtons` | `AllowedButtons[]` | `[]` | Shown but greyed out |
| `showProgress` | `boolean` | `false` | "1 of 5" text |
| `progressText` | `string` | `"{{current}} of {{total}}"` | Template |
| `nextBtnText` | `string` | `"Next"` | |
| `prevBtnText` | `string` | `"Previous"` | |
| `doneBtnText` | `string` | `"Done"` | Last step button |

**Callbacks** (all receive `(element, step, { config, state, driver })`):

`onHighlightStarted`, `onHighlighted`, `onDeselected`, `onDestroyStarted`, `onDestroyed`, `onNextClick`, `onPrevClick`, `onCloseClick`

**Special:** `onPopoverRender(popoverDOM, { config, state, driver })` -- fires after popover DOM is created.

## 3. Non-Blocking Tour (Overlay Doesn't Block Clicks)

The blocking mechanism is CSS: `.driver-active * { pointer-events: none }`. Two approaches:

**A) Invisible overlay (overlay exists but transparent):**
```ts
driver({ overlayOpacity: 0, allowClose: false })
```
Still blocks clicks because `pointer-events: none` is on all `*` elements.

**B) Actually non-blocking (override the CSS):**
```css
/* Remove the blanket pointer-events kill */
.driver-active * {
  pointer-events: auto !important;
}
/* Keep popover clickable */
.driver-popover, .driver-popover * {
  pointer-events: auto !important;
}
```
Combine with `allowClose: false`. The overlay SVG still exists but is pass-through.

**Mizan uses approach B** in `app/src/app/globals.css` -- the pointer-events override is always active, so even with a visible overlay (`overlayOpacity: 0.5`) users can still interact with the page behind the highlight.

## 4. Scroll-Blocking Workaround

driver.js auto-scrolls to highlighted elements, which can cause jarring jumps. Mizan's `triggerHighlight` function in `guide-chat.tsx` patches `window.scrollTo` during highlight to suppress this:

```tsx
const origScroll = window.scrollTo;
const d = driver({
  // ...config...
  smoothScroll: false,
  onHighlightStarted: () => {
    window.scrollTo = (() => {}) as typeof window.scrollTo;
  },
  onHighlighted: () => {
    setTimeout(() => { window.scrollTo = origScroll; }, 100);
  },
});
```

`onHighlightStarted` replaces `window.scrollTo` with a no-op before driver.js can call it. `onHighlighted` restores it 100ms after the highlight lands. Combined with `smoothScroll: false` and `animate: false`, this prevents any automatic scrolling.

## 5. Mizan driver.js Configurations

The app uses two different driver.js configurations depending on context.

### 5a. `triggerHighlight` (guide-chat.tsx) -- AI chat highlights and local page tours

Used when the AI agent highlights an element or during local page tour steps:

```tsx
const d = driver({
  popoverClass: "mizan-tour",
  showButtons: [],
  allowClose: true,
  overlayOpacity: 0.5,
  overlayColor: "#000",
  stagePadding: 10,
  stageRadius: 12,
  animate: false,
  smoothScroll: false,
  onHighlightStarted: () => { /* suppress scroll -- see section 4 */ },
  onHighlighted: () => { /* restore scroll -- see section 4 */ },
});
d.highlight({
  element: selector,
  popover: { title, description, side: "top", align: "center" },
});
```

### 5b. `useGuidePending` (use-guide-pending.ts) -- post-navigation highlights

Used when the guide navigates to a new page and needs to highlight an element after arrival. Retries up to 5 times (500ms apart) waiting for the DOM element to render:

```tsx
const d = driver({
  stagePadding: 8,
  stageRadius: 12,
  overlayOpacity: 0.15,
  allowClose: true,
  animate: true,
  showButtons: [],
});
d.highlight({
  element: pending.highlight!,
  popover: { title, description, side: "bottom", align: "center" },
});
```

Key differences from `triggerHighlight`: lower overlay opacity (0.15 vs 0.5), animations enabled, no scroll suppression, no `popoverClass`, popover defaults to `side: "bottom"`.

## 6. Programmatic Control from React State

Hide driver.js buttons, drive from your own UI:

```tsx
const driverRef = useRef<Driver | null>(null);

// In your useEffect after import:
driverRef.current = driver({
  showButtons: [],        // hide all driver.js buttons
  allowClose: false,      // prevent backdrop dismiss
  allowKeyboardControl: false,
  steps: [/* ... */],
});
driverRef.current.drive(0);

// External button handlers:
const handleNext = () => driverRef.current?.moveNext();
const handlePrev = () => driverRef.current?.movePrevious();
const handleSkip = () => driverRef.current?.destroy();
const handleGoTo = (i: number) => driverRef.current?.moveTo(i);
```

**Critical:** When overriding `onNextClick`/`onPrevClick`, driver.js disables default navigation. You MUST call `moveNext()`/`movePrevious()` yourself inside the callback.

## 7. Cleanup on Unmount

```tsx
useEffect(() => {
  let d: Driver | null = null;
  import("driver.js").then(({ driver }) => { d = driver({...}); });
  return () => { d?.destroy(); d = null; };
}, []);
```

For SPA route changes: call `destroy()` in the cleanup. If highlight disappears after navigation, the DOM element was replaced. Use `element: () => document.querySelector("#my-el")!` (function form) so driver.js re-queries the DOM. Call `driverRef.current?.refresh()` after route transition settles.

Mizan's `GuideChat` component destroys the driver instance on pathname change:
```tsx
useEffect(() => { setLocalTourIndex(-1); driverRef.current?.destroy(); }, [pathname]);
```

## 8. Mizan CSS Overrides (globals.css)

The `.mizan-tour` popover class uses CSS variables for theme-aware styling:

```css
/* Non-blocking: override driver.js pointer-events kill */
.driver-active * {
  pointer-events: auto !important;
}
.driver-popover, .driver-popover * {
  pointer-events: auto !important;
}

/* Dark theme popover */
.driver-popover.mizan-tour {
  background: var(--card, #1a1a2e);
  color: var(--foreground, #e0e0e0);
  border: 1px solid var(--border, #333);
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0,0,0,0.4);
  padding: 12px 16px;
  max-width: 280px;
}
.driver-popover.mizan-tour .driver-popover-title {
  color: var(--foreground, #fff);
  font-size: 13px;
  font-weight: 700;
}
.driver-popover.mizan-tour .driver-popover-description {
  color: var(--muted-foreground, #999);
  font-size: 11px;
  margin-top: 4px;
}
/* Arrow must match background per side */
.driver-popover.mizan-tour .driver-popover-arrow-side-top { border-top-color: var(--card, #1a1a2e); }
.driver-popover.mizan-tour .driver-popover-arrow-side-bottom { border-bottom-color: var(--card, #1a1a2e); }
.driver-popover.mizan-tour .driver-popover-arrow-side-left { border-left-color: var(--card, #1a1a2e); }
.driver-popover.mizan-tour .driver-popover-arrow-side-right { border-right-color: var(--card, #1a1a2e); }
```

Use: `driver({ popoverClass: "mizan-tour" })`

## 9. Local Page Tours (How Mizan Uses driver.js)

Mizan does **not** use a `useDriverTour` hook. Instead, the `GuideChat` component in `guide-chat.tsx` manages tours directly:

1. **Tour definitions** live in `guide-workflows.ts` as `PAGE_TOURS: Record<string, LocalTourStep[]>`.
2. The `GuideChat` component reads `PAGE_TOURS[pathname]` to get steps for the current page.
3. `highlightLocalStep(step)` calls the standalone `triggerHighlight()` function, which dynamically imports driver.js and creates a one-shot highlight.
4. The chat panel UI shows step cards and a "Next" button. Each click calls `handleLocalNext()`, which increments the index and calls `highlightLocalStep` with the next step.
5. On the last step, clicking "Next" destroys the driver instance and resets the tour index to -1.
6. On pathname change, the driver instance is destroyed and the tour index resets.

The guide chat panel also sits at `z-[100001]`, above driver.js's default overlay at `z-index: 10000`.

## 10. Popover Positioning

Per-step `popover.side` and `popover.align`:

- **side:** `"top" | "right" | "bottom" | "left" | "over"` (over = on top of element, hides arrow)
- **align:** `"start" | "center" | "end"`

```ts
{ element: "#btn", popover: { title: "Click here", side: "bottom", align: "start" } }
```

Mizan defaults: `triggerHighlight` uses `side: "top", align: "center"`. `useGuidePending` uses `side: "bottom", align: "center"`.

## 11. data-guide Selectors

All `data-guide` attributes currently in the codebase, organized by page:

### Tools
| Page | Selector | Element |
|---|---|---|
| `/tools/tax-calculator` | `salary-input` | Salary input card |
| `/tools/tax-calculator` | `tax-summary` | Tax result summary |
| `/tools/tax-calculator` | `tax-chart` | Pie chart card |
| `/tools/tax-calculator` | `tax-categories` | Spending category grid |
| `/tools/invest` | `capital` | Investment amount card |
| `/tools/invest` | `horizon` | Time horizon card |
| `/tools/invest` | `allocation` | Portfolio split card |
| `/tools/invest` | `output` | Results dashboard card |
| `/tools/buy-vs-rent` | `bvr-basics` | Property & rent inputs |
| `/tools/buy-vs-rent` | `bvr-financing` | Financing type card |
| `/tools/buy-vs-rent` | `verdict` | Buy vs rent verdict card |
| `/tools/buy-vs-rent` | `bvr-breakdown` | Cost breakdown content |
| `/tools/mashroaak` | `mashroaak-tabs` | Browse mode tabs |
| `/tools/mashroaak` | `capital-input` | Budget input card |
| `/tools/mashroaak` | `mashroaak-filters` | Filter controls |
| `/tools/mashroaak` | `mashroaak-results` | Results list |

### Economy & Finance
| Page | Selector | Element |
|---|---|---|
| `/economy` | `econ-indicators` | Key indicators grid |
| `/economy` | `gdp-chart` | GDP chart |
| `/economy` | `inflation-chart` | Inflation chart |
| `/economy` | `exchange-rate` | Exchange rate section |
| `/budget` | `budget-summary` | Revenue & spending grid |
| `/budget` | `budget-deficit` | Deficit card |
| `/budget` | `budget-flow` | Sankey diagram card |
| `/budget` | `budget-comparison` | Year comparison card |
| `/debt` | `debt-total` | Total debt card |
| `/debt` | `debt-gdp-ratio` | Debt-to-GDP card |
| `/debt` | `debt-chart` | Debt timeline (conditional tab) |
| `/debt` | `debt-creditors` | Creditor breakdown (conditional tab) |

### State Institutions
| Page | Selector | Element |
|---|---|---|
| `/government` | `president` | Head of state section |
| `/government` | `cabinet` | Cabinet ministers section |
| `/government` | `governorates-list` | Governorates list wrapper |
| `/parliament` | `party-chart` | Party composition tabs |
| `/constitution` | `search` | Article search controls |
| `/constitution` | `articles-list` | Articles list container |
| `/constitution/article/[number]` | `article-detail` | Article detail container |

**Note:** `debt-chart` and `debt-creditors` are inside conditional tab renders -- only one is in the DOM at a time depending on the active tab.

`article-detail` is on the individual article page, not the constitution index. It is present in the DOM but not included in `PAGE_TOURS` or `PAGE_SELECTORS`.

## 12. Pitfalls

| Problem | Cause | Fix |
|---|---|---|
| Hydration crash | Top-level `import "driver.js"` | Dynamic import inside `useEffect` or async callback |
| Overlay blocks all clicks | `.driver-active * { pointer-events: none }` in CSS | Override with `pointer-events: auto !important` (see section 3B) |
| Highlight vanishes after navigation | DOM element replaced by React re-render | Use function form `element: () => document.querySelector(...)` + call `refresh()` |
| onNextClick doesn't advance | Overriding callback disables default behavior | Must call `driverObj.moveNext()` inside callback |
| Popover shows but no highlight | Element not in DOM yet when `drive()` called | Delay `drive()` or use `onHighlightStarted` to wait |
| Arrow color wrong on custom theme | Arrow uses `border-color` not `background` | Set per-side `.driver-popover-arrow-side-*` classes matching popover background |
| `destroy()` not cleaning up | ref lost between renders | Store in `useRef`, destroy in `useEffect` cleanup |
| driver.js auto-scrolls to element | Default behavior scrolls viewport | Suppress with `smoothScroll: false` + `onHighlightStarted` scroll patch (see section 4) |
| Highlight not visible behind guide panel | Guide panel z-index covers overlay | Guide panel is `z-[100001]`, driver overlay is `z-index: 10000` -- panel sits above |
