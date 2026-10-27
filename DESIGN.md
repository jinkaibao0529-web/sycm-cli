---
name: 市场观察
description: A compact local market-ranking workbench with white surfaces, ink type and cobalt actions.
colors:
  primary: "#2257d6"
  primary-hover: "#1949bd"
  primary-soft: "#edf3ff"
  ink: "#1a2233"
  secondary-text: "#5b6a81"
  connection-text: "#526680"
  workspace: "#f6f8fb"
  surface: "#fff"
  border: "#e6eaf0"
  danger: "#b32631"
  danger-soft: "#fff2f3"
  focus: "#8eb4ff"
typography:
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "14px"
    fontWeight: 600
  body:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
  table:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif'
    fontSize: "11px"
    fontWeight: 400
rounded:
  field: "6px"
  button: "7px"
  navigation: "8px"
  panel: "10px"
  dialog: "14px"
spacing:
  icon-gap: "8px"
  compact: "12px"
  medium: "16px"
  panel: "20px"
  wide: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 15px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "#46536a"
    rounded: "{rounded.button}"
    padding: "0 15px"
  button-ghost:
    textColor: "#69758a"
    rounded: "{rounded.button}"
    padding: "0 15px"
  button-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    rounded: "{rounded.button}"
    padding: "0 15px"
  source-select:
    backgroundColor: "{colors.surface}"
    textColor: "#455168"
    rounded: "{rounded.field}"
    height: "40px"
    padding: "0 32px 0 11px"
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
---

# Design System: 市场观察

## Overview

**Creative North Star: "The Operational Ledger"**

A precise, compact workbench lets a dataset move from browser connection through collection progress into a stable product ledger. White working surfaces sit on a cool pale-gray workspace; ink headings and restrained cobalt establish the hierarchy. The visual vocabulary comes from operational stock ledgers and desktop spreadsheets, with thin rules and Lucide outline icons.

Connection, source controls, progress and results remain spatially related as their content changes. Motion preserves continuity through shared placement and short state transitions. This is a code-led visual system; decorative photography and fabricated data are not part of its expression.

**Key Characteristics:**
- White working surfaces and cool neutral dividers.
- Compact Chinese UI typography with tabular numeric values.
- Cobalt for actions, selection and completion; red for errors.
- Stable ledger columns and visible connection provenance.
- Short motion with explicit arrivals and departures.

## Colors

The palette is primarily white and ink, with cobalt as its single action accent.

### Primary
- **Operational Cobalt** (`primary`): primary collection action, selected navigation, top ranks and completion markers.
- **Pressed Cobalt** (`primary-hover`): primary button hover.
- **Cobalt Wash** (`primary-soft`): navigation selection, count badges and link hover backgrounds.

### Neutral
- **Ledger Ink** (`ink`): page headings and inherited body text.
- **Legible Slate** (`secondary-text`): final stylesheet override for repeated secondary copy, navigation labels, table headers, metadata and helper text. This override supersedes their earlier, lighter selector declarations.
- **Connection Slate** (`connection-text`): final override for connection supporting copy.
- **Cool Workspace**, **White Surface**, **Fine Rule** (`workspace`, `surface`, `border`): workspace, working containers and structural separation.
- **Focus Blue** (`focus`): the visible keyboard outline.

Error red and its pale wash (`danger`, `danger-soft`) belong to failed task or feedback states and the danger button variant. They are semantic exceptions, not a second decorative accent. The earlier root `--muted` value remains in source but is not the authoritative color of selectors covered by the final contrast override.

**The Single Accent Rule.** Use cobalt for action and state; reserve red for errors.

## Typography

**Display Font:** No separate display face is used.
**Body Font:** Segoe UI, Microsoft YaHei UI, PingFang SC, sans-serif.
**Label/Mono Font:** Labels share the body stack; setup paths use native code typography.

**Character:** Compact, quiet UI text prioritizes scanning Chinese labels and comparing numbers. The page heading is the largest editorial gesture; table content stays deliberately dense.

### Hierarchy
- **Headline:** the frontmatter headline role; mobile reduces its size to 23px.
- **Title:** results heading and dialog title use the title role; source section headings use 13px at weight 550.
- **Body:** the body role is the base; supporting operational copy is commonly 11–12px with line heights of 1.7–1.9.
- **Label:** the label role defines standard buttons; small buttons use 11px.
- **Table:** the table role governs the ledger; rank values rise to 13px, while IDs and rank changes are 9px. Product titles use two-line clamping and a 1.7 line height.

**The Aligned Numbers Rule.** Use tabular numerals for ranks, count badges, item IDs, numeric result columns, pagination and history counts. Right-align numeric ledger columns.

## Layout

Desktop uses a fixed left rail (212px), a workspace offset by the same amount and a 66px top bar. Main content has a maximum width of 1780px, centered within the workspace, with 34px top and 36px horizontal padding. The heading aligns title and export action. Connection and task strips span the work area above bordered source and result panels.

Source controls use four columns: three flexible fields followed by the collection action. Panel gutters are generally 20px. Ledger tables retain a minimum width of 880px inside a horizontal scrolling container, preserving the relationship between product, shop, keywords and right-aligned figures; product rows are 83px high with 44px thumbnails.

At widths of at least 1550px the rail grows to 230px, main horizontal padding to 42px and top padding to 40px. At 1150px and below the rail shrinks to 184px, main horizontal padding becomes 24px and source controls become two columns. At 760px and below the rail becomes a sticky horizontal header, the workspace loses its left offset, the top bar becomes 48px and main padding becomes 25px 18px 16px. The settings navigation retains an accessible name when its visible text is hidden. Connection actions wrap, source selection spans the available width, search becomes full width and history rows wrap. The ledger itself remains scrollable rather than compressing its columns.

**The Stable Ledger Rule.** Preserve table column structure and scroll it horizontally when space is constrained.

## Elevation & Depth

Working panels are flat white with thin borders; tonal washes identify selection, connection and status. Shadows are reserved for floating surfaces: the dialog uses `0 20px 70px rgba(20,37,72,.16)` and the toast uses `0 8px 30px rgba(30,49,85,.1)`. The dialog backdrop is a translucent dark wash with a 3px blur. Search focus uses a two-pixel pale-blue halo in addition to a border change.

**The Flat Work Surface Rule.** Use borders and tonal separation for working panels; floating feedback and dialogs carry the shadow vocabulary.

## Shapes

Rectangular panels use the panel radius. Fields and thumbnails use the field radius, buttons the button radius, selected navigation the navigation radius and the dialog the dialog radius. Status pills and count badges use small 5px corners. Structural rules are one pixel. Outline icons use a 1.8 stroke width and typically occupy 13–24px; product imagery is the only data-driven raster treatment.

## Components

### Buttons

Compact action controls combine outline icons with short labels. The component API exposes default, outline, ghost and danger variants plus default, small and icon sizes. Standard controls have a 38px minimum height and the frontmatter button padding; small controls use 32px with 11px horizontal padding; icon controls have a 29px minimum square footprint and 5px padding.

Primary and outline hover scale to 1.015; ghost hover scales to 1.02. Press scales to .97. Background and border states transition over 160ms. Outline hover uses a pale-blue surface and stronger blue-gray border; ghost hover gains a blue wash. Disabled buttons use .46 opacity and a not-allowed cursor. All keyboard targets inherit the visible three-pixel focus outline with a three-pixel offset.

### Inputs / Fields

Source selection is a native select with a one-pixel border, white fill, inset chevron and the field radius. Disabled source selection uses a pale neutral fill. The search field is a bordered icon-and-input wrapper, 33px minimum height, with a border change and halo on focus within. Inputs have accessible labels; search includes a named clear button when populated.

### Navigation

The rail uses icon-and-label buttons with a shared rounded selection wash. The selection highlight moves with a shared layout identifier. The active item carries `aria-current="page"`. Hover adds a subtle neutral wash. The final contrast override makes default navigation text Legible Slate; the more specific selected state retains cobalt, reinforced by weight and background.

### Cards / Containers

Source, results, history and settings containers share the white, bordered panel treatment. Connection uses a blue-gray wash and an inset icon tile, with a slightly bluer connected state. Task strips combine status icon, counts, message, timestamp or cancel action, and a two-pixel progress line. Status remains textual as well as colored.

### Ledger and Feedback

The semantic table has a lightly tinted header, thin row dividers, faint hover fill, two-line titles and explicit empty/missing-data representations. Product thumbnails have empty alt text because adjacent titles carry their meaning. Product links have descriptive accessible names. Empty states explain the next step without synthetic rows. Tasks announce changes politely; toasts use status or alert roles and a named dismiss control. Toasts remain visible for five seconds.

The Radix dialog supplies title, description, close control and focus management. Its width is capped at 620px and its height at viewport minus 48px (30px on mobile), with internal scrolling.

### Motion and Reduced Motion

The global Motion configuration uses a 240ms transition and `cubic-bezier(.16,1,.3,1)`. Page and empty-state changes use 200ms opacity plus a six-pixel entrance and four-pixel upward exit. Source details expand and collapse height with opacity; task strips and connection/source containers participate in layout animation. Connection icon and copy are separately keyed, wait for the outgoing state and swap over 120ms; icon scale changes are .9 to 1 on entry and .95 on exit, and copy moves three pixels. Table rows use stable dataset-and-item keys, positional layout animation, 160ms opacity entry and an explicit opacity/three-pixel upward exit. Dialog, toast and overlay each have entrance and exit states. Loading icons rotate once per second.

`MotionConfig` follows the user's reduced-motion preference and `useReducedMotion` removes page, connection, dialog and row transforms or shortens those transitions. The final CSS media query disables continuous animation, makes CSS transitions effectively instant, removes button hover/press transforms, restores automatic scroll behavior and removes backdrop blur. Avoid adding motion that bypasses these paths.

## Do's and Don'ts

### Do:
- **Do** use cobalt for actions and state, with text and shape reinforcing status.
- **Do** preserve the final secondary-text contrast overrides when extending helper copy or metadata.
- **Do** keep numeric columns aligned and the ledger horizontally scrollable.
- **Do** provide named icon controls, keyboard focus and reduced-motion behavior.
- **Do** give dynamic states explicit exits and keep related elements moving with their container.

### Don't:
- **Don't** promote earlier pale secondary CSS declarations above the final contrast overrides.
- **Don't** use red as a decorative accent or add emoji in place of outline icons.
- **Don't** add decorative charts, oversized statistics or repeated dashboard cards to this operational world.
- **Don't** present sample rows or inferred exact quantities as actual collected data.

## Period controls v0.2

The six-mode group extends the existing restrained ledger. Use the existing cobalt token for the selected label and a shared white layout highlight over the neutral track. Date/month/week inputs sit to the right on desktop and wrap below the track on narrow screens. The mode group uses `aria-pressed`, native labeled date inputs, named previous/next buttons and visible valid-range copy. Date clear/invalid states disable collection and stepping; active-task provenance remains independent of the next selection. Calendar/context changes have keyed presence exits, and MotionConfig/CSS preserve reduced-motion behavior. No palette or typography tokens changed.
