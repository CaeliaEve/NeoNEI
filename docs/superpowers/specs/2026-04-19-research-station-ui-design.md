# GT Research Station UI Design

## Status

Approved for implementation planning.

## Goal

Rebuild the `gt_research_station` recipe page into a dedicated NeoNEI presentation instead of reusing a generic GT machine layout.

The new page must:

- Use the approved `Scan Chamber` visual direction.
- Preserve clear `Input -> Research Core -> Output` flow.
- Surface research-specific machine metrics prominently.
- Stay aligned with NeoNEI's current visual language rather than looking like a foreign overlay.

## User-Approved Direction

The selected direction is `A · Scan Chamber`.

Core intent:

- Left side is the research input chamber.
- Right side is the research result chamber.
- Center is a scanning / analysis core that visually communicates technical decoding, not mystical ritual.
- Research metadata must be visible in the page, including metrics such as computation, research cost, duration, and machine energy usage.

## Visual Structure

### 1. Header Layer

Purpose:

- Identify the machine and the active operating tier without competing with the main stage.

Content:

- Machine title from `machineInfo.machineType`, falling back to `recipeType` and then `GT Research Station`.
- Secondary subtitle: `Research Station`.
- Voltage tier badge from `metadata.voltageTier` or `machineInfo.parsedVoltageTier`.

Rules:

- Title area stays compact.
- Tier badge remains visually distinct but secondary to the machine name.

### 2. Metrics Layer

Purpose:

- Present the research costs cleanly and immediately.

Display cards:

- `EU/t`
- `Duration`
- `RU Cost`
- `Computation`

Data rules:

- `EU/t`: from `euPerTick`, `eut`, or `EUt`
- `Duration`: from `duration`
- `RU Cost`: prefer explicit research values, else fall back to computed total EU
- `Computation`: prefer explicit computation fields, else fall back to duration-derived value

Formatting rules:

- Missing data renders as `--`
- Numeric values use localized formatting
- Duration is rendered in seconds or `Xm Ys`

### 3. Main Stage

Purpose:

- Make the research process readable at a glance.

Layout:

- Three-column stage:
  - left chamber: input item
  - center chamber: scan core
  - right chamber: output item

Behavior:

- Input and output slots remain clickable and continue using the existing item-click behavior.
- Center chamber has no click behavior.

### 4. Scan Core

Purpose:

- Convey analysis / decoding / transformation rather than crafting or ritual.

Approved motion language:

- Circular scan rings or restrained orbit lines
- Soft beam / lane indicating transfer from input toward output
- Contained high-tech glow, not aggressive neon

Rejected directions:

- Ritual styling
- Overly loud HUD clutter
- Overdesigned console walls
- Effects that obscure the item flow or metrics

## Visual Language

Tone:

- Cold technical laboratory
- GregTech-adjacent precision
- NeoNEI polish

Color principles:

- Input side biased toward cool steel / blue-cyan
- Output side biased toward warm amber-gold
- Core remains primarily cool and analytical

Material principles:

- Dense dark shell
- Subtle inset borders
- Mild scan glow
- No noisy decorative chrome

## Interaction Rules

- Input item click emits `item-click` with input item ID
- Output item click emits `item-click` with output item ID
- Hover feedback remains responsive but restrained
- Center scan core is decorative only

## Responsiveness

Desktop:

- Preserve the three-part composition.

Tablet / narrow desktop:

- Metrics may collapse from 4 columns to 2 columns.

Mobile:

- Main stage stacks vertically.
- Input, core, and output remain visually grouped in that order.

## Error Handling and Data Fallback

- If an input item is missing, render an empty input slot.
- If an output item is missing, render an empty output slot.
- If any metric is unavailable, show `--`.
- Missing metadata must never break layout or animation.

## Implementation Scope

In scope:

- Rework `frontend/src/components/GTResearchStationUI.vue`
- Refine layout, visual hierarchy, and motion
- Keep current metadata extraction behavior unless a render issue requires minor normalization

Out of scope:

- Changing backend export format
- Adding new recipe fields
- Changing route behavior or recipe browser behavior

## Verification Targets

- Research station recipes render with the dedicated layout
- All four metrics display correctly when present
- Missing metadata degrades safely
- Input and output item clicks still navigate correctly
- Narrow layouts do not overlap or clip

## Files Expected to Change During Implementation

- `frontend/src/components/GTResearchStationUI.vue`
- Optional test coverage if a targeted regression is added

## Open Follow-Up

If the new UI works well, the same design discipline can later be applied to other GT specialty pages without forcing them into a shared machine template.
