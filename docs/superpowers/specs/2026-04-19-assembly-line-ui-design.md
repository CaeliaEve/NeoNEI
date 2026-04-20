# GT Assembly Line UI Design

## Status

Approved for implementation planning.

## Goal

Completely redesign the `gt_assembly_line` recipe page into a dedicated NeoNEI assembly-line interface using a modern high-tech sci-fi visual language.

This redesign must:

- abandon the current visual language rather than refining it
- use a fixed `4×4` item input matrix
- use a fixed `1×4` vertical fluid input column
- use a single prominent output slot
- present the page primarily in Chinese
- deliver a high-end dark industrial cyberpunk interface with restrained glassmorphism / neomorphism material treatment

## User-Approved Direction

The approved direction is:

- 工业总线台`r

Core intent:

- Left side is a disciplined `4×4` input bus matrix.
- Middle section is a dedicated fluid and transfer conduit zone.
- Right side is a single emphasized output chamber.
- The page must feel like a premium futuristic assembly machine, not a reused GT card.

## Structural Contract

### Fixed Layout Rules

The following structure is mandatory:

- left: `4×4` input matrix with 16 square slots
- middle: `1×4` vertical fluid input column
- right: one large output slot
- bottom: concise machine metrics such as energy and time

This layout is not optional and must not collapse back into the previous composition.

### Header Direction

The top region should be minimal and controlled:

- machine identity
- tier / voltage badge
- no verbose descriptive sentence blocks

The page should read as a machine interface first, not a documentation card.

## Visual Direction

### Theme

Target feel:

- dark sci-fi industrial workstation
- cyberpunk manufacturing interface
- premium dashboard-level machine UI

Reference mood:

- Dribbble-grade concept polish
- Figma-style component discipline
- high-end game database UI

### Color System

Core palette:

- deep charcoal / graphite background
- neon cyan for active pathways and input emphasis
- energetic amber for result / output emphasis
- restrained slate and steel neutrals for shells and separators

Color role mapping:

- input matrix: cool cyan / blue emphasis
- fluid column: glowing liquid colors inside transparent tanks
- transfer lane: cyan-to-amber circuit energy flow
- output slot: strongest amber completion highlight

### Materials

Use:

- subtle glassmorphism for tanks and select panels
- restrained neomorphism for slot wells and recessed machine surfaces
- soft inner shadows for slot depth
- clean glow edges, not fuzzy bloom everywhere

Avoid:

- flat generic panels
- noisy textured grids
- obvious placeholder slot carpets
- decorative effects that do not explain machine flow

## Region-Level Design

### 1. Input Matrix

Layout:

- strict `4×4` matrix
- 16 square slots
- all slots aligned and evenly spaced

Visual rules:

- rounded corners
- subtle recessed wells
- soft inner shadows
- cyan hover / active emphasis

Meaning:

- this area represents the assembly line input bus, so it must feel precise, modular, and machine-ordered

### 2. Fluid Column

Layout:

- one vertical stack of 4 transparent rectangular tanks

Visual rules:

- tank body uses translucent glass shell
- liquid fill glows from inside
- each fluid chamber reads clearly even when empty
- empty chambers remain elegant, not dead boxes

Meaning:

- this is a machine fluid feed column, not inventory slots turned vertical

### 3. Transfer Conduit

Layout:

- sits between input matrix and output slot
- uses the approved `裂隙纺锤` treatment
- is built around one narrow vertical rift-like spindle core with two to three floating geometric alignment shards on each side

Visual rules:

- remove the current oval / capsule placeholder shapes entirely
- remove any obvious progress-bar-like left-to-right strip treatment
- remove large circular ring motifs entirely
- the spindle core should look like a dark high-energy slit or compressed rift with a thin cold edge glow
- surrounding geometric shards should be slender, faceted, and slightly offset rather than circular or blocky
- motion should come from subtle shard alignment drift and restrained internal rift pulsing, not a running bar
- color remains cold cyan-blue dominant, with only a restrained amber hint toward the output side
- the region must feel mysterious and premium while still belonging to an industrial assembly page

Meaning:

- this region visually communicates assembly flow and recipe transformation

### 4. Output Chamber

Layout:

- one single large slot

Visual rules:

- strongest amber emphasis on the page
- reads as finished product chamber
- more prominent than any single input slot

Meaning:

- the interface must make it obvious that the assembly line synthesizes many inputs into one completed result

### 5. Bottom Metrics

Layout:

- compact three-card or strip layout

Primary content:

- total energy
- power / EU/t
- time / duration

Visual rules:

- minimalist typography
- small labels, stronger values
- no bulky stat cards that compete with the main machine stage

## Typography

Language:

- Chinese first
- keep technical units like `EU`, `EU/t`, `ticks` when appropriate

Direction:

- clean sans-serif
- crisp dashboard labels
- restrained hierarchy

Avoid:

- oversized display copy
- long helper paragraphs
- mixed English labels for non-technical text

## Motion

Motion should be restrained and premium.

Allowed:

- subtle liquid glow
- energy travel in transfer conduit
- hover glow on active slots
- quiet output chamber breathing light

Avoid:

- dramatic spinning ornaments
- excessive bloom
- animation that feels magical instead of engineered

## Interaction Rules

- Input item slots remain clickable.
- Fluid entries remain clickable.
- Output remains clickable.
- Existing item cycling behavior for alternate inputs remains intact.

## Responsiveness

Desktop:

- preserve the fixed three-zone logic
- keep the machine reading horizontally

Tablet:

- maintain the same left-middle-right order with proportion tightening

Mobile:

- stacking is allowed only if required by width
- the order must remain input → fluid → output
- visual language must survive the collapse cleanly

## Implementation Scope

In scope:

- fully redesign `frontend/src/components/GTAssemblyLineUI.vue`
- replace the current visual system
- enforce `4×4` input, `1×4` fluid, single output presentation
- rebuild the page into the approved sci-fi industrial interface

Out of scope:

- changing router/component selection logic
- changing recipe interaction behavior
- changing backend export format

## Verification Targets

- The page renders as a dedicated assembly-line interface, not a reused machine card.
- Input matrix is clearly `4×4`.
- Fluid input reads clearly as `1×4`.
- Output is singular and visually dominant.
- The background is clean and premium, without ugly placeholder grid treatment.
- Item and fluid click interactions still work.
- Responsive behavior remains safe.

## Expected Files To Change

- `frontend/src/components/GTAssemblyLineUI.vue`
- `frontend/scripts/gt-assembly-line-ui-regression.test.mjs`

