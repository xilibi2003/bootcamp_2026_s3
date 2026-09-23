---
name: Sleek DeFi Vault
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#4cd7f6'
  on-secondary: '#003640'
  secondary-container: '#03b5d3'
  on-secondary-container: '#00424e'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00a572'
  on-tertiary-container: '#00311f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0em
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0em
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.005em
  body-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.06em
  data-mono:
    fontFamily: Hanken Grotesk
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system delivers an elite, institutional-grade decentralized finance interface tailored for high-conviction token staking and yield generation. Designed for Web3 natives, liquidity providers, and asset managers, it projects unwavering cryptographic security, mathematical clarity, and technological sophistication.

The visual direction combines refined minimalism with focused glassmorphism. Deep, velvety slate-zinc backgrounds eliminate visual fatigue during intensive trading, while high-frequency neon accents—electric violet, cyan, and emerald green—direct focus to liquidity status, yields, and transaction flows. Elements feature precision borders, subtle luminance gradients, and generous touch targets optimized for high-stakes mobile DeFi interactions.

## Colors

The color palette establishes an atmospheric, high-contrast dark space where neon indicators signal security, precision, and state progression:

- **Primary (`#8B5CF6` - Electric Violet):** Drives critical staking actions, active interactive states, and protocol governance indicators.
- **Secondary (`#06B6D4` - Neon Cyan):** Highlights analytical data, APY metrics, smart contract indicators, and secondary navigation triggers.
- **Tertiary (`#10B981` - Radiant Mint/Emerald):** Designates positive yield margins, successful transactions, confirmed state badges, and verified asset contracts.
- **Error / Destructive (`#EF4444`):** Flags transaction slippage alerts, failed execution, network gas spikes, and liquidations.
- **Neutral & Surface Foundations (`#0B0F19`, `#0F172A`, `#1E293B`, `#334155`):** Tiered dark slate and zinc layers establish canvas depth while preserving contrast for fine typography.

Dynamic gradient fills pairing Electric Violet with Neon Cyan are reserved strictly for high-yield protocol highlights and final primary transaction confirmations.

## Typography

The typographical pairing ensures high mathematical legibility and brand distinction:

- **Headlines (Plus Jakarta Sans):** Modern geometric grotesk forms with soft terminals infuse confidence and warmth into cold financial data. Tight negative tracking on large scales accentuates digital prestige.
- **Body & Numerical Readouts (Hanken Grotesk):** Engineered with crisp counters and robust horizontal proportions, ensuring uninterrupted scan paths when evaluating contract addresses, gas estimates, decimal staking figures, and token volumes.
- **Data & Numerical Emphasis:** All numerical figures representing currency, token amounts, and APY rates enforce tabular figures (`tnum`) to eliminate layout jitter during live telemetry and block updates.

## Layout & Spacing

The layout is built around a mobile-first, single-column fluid card hierarchy, scaling to a 4-to-8 column system on tablets and desktop viewports:

- **Mobile Viewports (<640px):** Employs a strict 16px (`1rem`) screen margin with 12px (`0.75rem`) internal column gaps. Form fields, balance selectors, and deposit modules occupy 100% of the active container width, anchoring touch targets comfortably within the ergonomic thumb zone.
- **Tablet & Desktop Viewports (≥640px):** The primary vault console constrains to a centered 480px–560px module, preventing informational fragmentation.
- **Rhythmic Stacking:** Vertical spacing follows an 8px base grid. Element pairings (such as input labels and text inputs) use `space-xs` (4px) or `space-sm` (8px), while distinct modules (such as the Vault Card and the Staking Form) separate cleanly with `space-lg` (24px) or `space-xl` (32px).

## Elevation & Depth

Visual hierarchy uses a layered glassmorphic architecture over deep slate space, employing ambient glows rather than dense physical drop shadows:

- **Base Layer (Canvas):** Pure dark background (`#070A11` to `#0B0F19`) layered with subtle, static radial blurs in electric violet and cyan at 8% opacity to simulate ambient blockchain infrastructure.
- **Surface Layer 1 (Vault Glass Panels):** Translucent fill (`rgba(15, 23, 42, 0.72)`) backed by a 16px to 20px backdrop blur. Finished with a 1px continuous border of `rgba(255, 255, 255, 0.08)`.
- **Surface Layer 2 (Interactive Modules & Inputs):** Elevated inputs and nested card surfaces (`rgba(30, 41, 59, 0.65)`) with a 1px border of `rgba(255, 255, 255, 0.12)`.
- **Elevated Interactive Glows:** Primary action triggers and confirmed status badges utilize soft, tinted outer glows (`box-shadow: 0 0 20px rgba(139, 92, 246, 0.35)`) that intensify subtly on active touch or hover states.

## Shapes

The design system embraces modern pill-shaped curvature (roundedness level 3), delivering an inviting, futuristic feel to technical financial mechanics:

- **Buttons, Badges & Segmented Tabs:** Full pill geometry (`border-radius: 9999px`) provides high tactile affordance and distinct visual containment.
- **Data Cards & Staking Modules:** Sized at `rounded-lg` (2rem / 32px) for primary outer containers and `rounded` (1rem / 16px) for embedded sub-panels, providing nested visual harmony.
- **Input Fields:** Form controls utilize `rounded` (1rem / 16px) corner radiuses, balancing structural volume with pill-shaped quick-select chips (`25%`, `50%`, `MAX`).

## Components

### Segmented Tabs (Deposit / Withdraw)
- **Container:** Full pill (`border-radius: 9999px`), background `rgba(15, 23, 42, 0.8)`, padded with `space-xs`, 1px border in `rgba(255, 255, 255, 0.08)`.
- **Active Segment:** Full pill background in `#1E293B`, elevated with a crisp border in `rgba(139, 92, 246, 0.4)` and a soft violet ambient glow. Text styled in `label-md` with white text color.
- **Inactive Segment:** Transparent background, text in slate-400 (`#94A3B8`), transitioning seamlessly on touch.

### Crypto Staking Input Field & Token Selector
- **Container:** Stacked card surface with roundedness of 16px, background `rgba(30, 41, 59, 0.4)`, border in `rgba(255, 255, 255, 0.1)`. Shifts to `#8B5CF6` border on focus.
- **Top Row:** Balance indicator and "Use Max" trigger in `label-sm` with cyan accenting.
- **Center Row:** High-legibility numeric text field with large tabular numbers (`headline-md`) coupled to a right-aligned Token Selector Pill (Token Icon, Symbol, and Chevron dropdown).
- **Bottom Row:** Real-time fiat equivalent value (USD) accompanied by percentage shortcut chips (`25%`, `50%`, `75%`, `MAX`) styled with pill contours and subtle glass borders.

### Primary Action Buttons
- **Staking Execution:** Full pill, background gradient from `#8B5CF6` to `#7C3AED`, overlaid with an interior top specular highlight (`inset 0 1px 1px rgba(255, 255, 255, 0.35)`). Label set in `label-lg`, center-aligned with high-contrast pure white text.
- **Disabled State:** Translucent fill `rgba(139, 92, 246, 0.2)` with muted text `rgba(255, 255, 255, 0.3)` and removed shadow glow.

### Status Badges & Glow Indicators
- **Confirmed:** Pill capsule with background `rgba(16, 185, 129, 0.15)`, 1px border in `#10B981`, text in `#10B981`. Features an 8px circular indicator with an emerald breathing pulse animation (`box-shadow: 0 0 8px #10B981`).
- **Pending:** Pill capsule with background `rgba(6, 182, 212, 0.15)`, 1px border in `#06B6D4`, text in `#06B6D4`, accompanied by an inline neon cyan rotating spinner.
- **Failed / Error:** Pill capsule with background `rgba(239, 68, 68, 0.15)`, 1px border in `#EF4444`, text in `#EF4444`.

### Vault Analytics Cards
- Structured with glassmorphism backing (`rgba(15, 23, 42, 0.7)`), 1px border gradient transitioning from violet to transparent.
- Displays key performance indicators: Total Value Locked (TVL), Net APY (highlighted in `#10B981` neon font), and Lockup Duration with clear monospaced mathematical precision.