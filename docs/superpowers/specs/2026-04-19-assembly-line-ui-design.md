# GT Assembly Line UI Design

## Status

Approved for implementation planning.

## Goal

Upgrade the `gt_assembly_line` recipe page into a stronger NeoNEI-specific assembly line experience without changing the current structural layout.

This redesign must:

- Preserve the current major layout regions.
- Expand the canvas so the page uses more of the available recipe stage.
- Rebuild the visual language around an industrial assembly-line identity.
- Improve color hierarchy so input, transfer, fluid bus, and output read more clearly.

## User-Approved Direction

The approved direction is:

- Keep the current layout structure.
- Make the overall canvas larger.
- Refine the UI rather than replacing the page architecture.
- Change the color system so the page has a stronger dedicated assembly line identity.

## Layout Constraints

The following structure is preserved:

- Header strip
- Main stage with:
  - input area
  - fluid / transfer area
  - output area
- Bottom status bar

Allowed changes:

- Resize regions
- Rebalance proportions
- Re-style each region
- Improve spacing and emphasis

Not allowed in this pass:

- Replacing the layout with a different page composition
- Converting the page into a research, ritual, or console-style screen
- Introducing a second independent layout mode

## Canvas Direction

### 1. Larger Stage

Purpose:

- Make the assembly line page feel substantial and machine-scale.

Changes:

- Increase the visual footprint of the full canvas.
- Give the stage more horizontal and vertical presence.
- Let the input, fluid bus, and output regions breathe.

Result:

- The page should feel less cramped and more like a dedicated production line surface.

### 2. Preserve Existing Spatial Logic

Purpose:

- Keep learned behavior intact while improving visual quality.

Rules:

- Input remains visually dominant on the left.
- Flow / fluid region stays central.
- Output remains clearly separated on the right.
- Bottom bar continues to summarize machine stats.

## Visual Language

### Theme

The assembly line should feel like:

- a dark industrial fabrication platform
- a precision production lane
- a high-tier GregTech machine, not a generic crafting board

### Color System

Recommended palette:

- Deep graphite / steel base for the shell
- Cold cyan-blue as the transfer / bus accent
- Warm amber-gold as the output completion accent
- Muted slate for neutral support surfaces

Color role mapping:

- Input bus: cool industrial blue
- Transfer / fluid spine: brighter cyan energy lane
- Output: warmer amber / brass emphasis
- Status cards: restrained neutral with selective highlight accents

### Material Direction

Use:

- layered dark panels
- subtle machine seams
- controlled glow
- precise metallic framing

Avoid:

- ritual or mystical glow language
- candy gradients
- noisy decorative effects
- soft toy-like cards

## Region-Level Redesign

### Header

Keep:

- machine identity
- tier chip

Improve:

- stronger machine-title hierarchy
- cleaner panel framing
- more credible industrial header treatment

### Input Area

Keep:

- current grid / input-bus structure

Improve:

- panel scale
- slot framing
- bus identity
- better emphasis for alternates / cycling items

### Flow / Fluid Area

Keep:

- fluid section in the middle
- transfer direction and central role

Improve:

- flow lane readability
- fluid bus identity
- assembly throughput feel
- central lane should look like a production conduit, not a placeholder column

### Output Area

Keep:

- single clear output emphasis

Improve:

- stronger "completed product" visual state
- better contrast from the input side
- warmer completion tone

### Bottom Status Bar

Keep:

- total EU
- EU/t or machine load summary
- duration

Improve:

- visual consistency with the upper canvas
- cleaner stat-card polish
- better hierarchy between value and label

## Motion and Effects

Motion should stay restrained and machine-like.

Allowed:

- slow line energy movement
- subtle conduit pulse
- quiet hover response
- low-noise fluid shimmer

Avoid:

- excessive spinning ornaments
- ornamental animation disconnected from the machine flow
- anything that makes the page feel magical instead of industrial

## Interaction Rules

- Item inputs remain clickable.
- Special items remain clickable.
- Fluid slots remain clickable.
- Output remains clickable.
- Existing cycling behavior for alternate item variants remains intact.

## Responsiveness

Desktop:

- Keep the current layout logic but with larger, more spacious proportions.

Tablet:

- Preserve the same stage order while allowing tighter scaling.

Mobile:

- Existing stacking behavior may stay, but styling should remain coherent.

## Implementation Scope

In scope:

- Rework `frontend/src/components/GTAssemblyLineUI.vue`
- Increase canvas scale
- Redesign panel treatment and color system
- Improve visual hierarchy of the current layout

Out of scope:

- Changing data extraction behavior unless minor adjustments are strictly necessary
- Introducing a new router path or alternate component architecture
- Replacing the current assembly line layout with a new one

## Verification Targets

- Assembly line page still renders the current structure correctly.
- Canvas reads larger and more substantial.
- Input / flow / output zones are visually clearer.
- Output area has stronger completion emphasis than input.
- Existing item and fluid interactions still work.
- Responsive layout still behaves safely.

## Expected Files To Change

- `frontend/src/components/GTAssemblyLineUI.vue`
- Optional targeted regression coverage if implementation needs a layout marker test
