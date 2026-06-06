# HumanTouch Style Notes

Updated: 2026-05-25

## Preferred HumanTouch Direction

The future HumanTouch UI should move away from the Claude-inspired theme and use the provided
`story-scroll` reference as the style direction. Do not apply the story-scroll component directly
unless requested; preserve its visual language as inspiration for later UI redesign work.

Core direction:

- Product feel: bold, editorial, confident, and structured, while still working as an admin webapp.
- Use high-contrast full-surface sections and panels rather than soft Claude-like beige chat surfaces.
- Prefer strong color blocking, clear horizontal rules, uppercase section labels, and large typographic hierarchy.
- Keep the operational HumanTouch app structure intact: agent management, assignments, sessions, and chat.
- Avoid making the app look like a generic Claude clone or a plain chatbot.

Reference palette from the provided component:

- Signal orange: `#fd5200`
- True black: `#000`
- Warm off-white: `#F5F0E8`
- Strong blue: `#1A3DE8`
- White foreground: `#fff`

Typography direction:

- Use a modern sans-serif such as `Plus Jakarta Sans`, `Inter`, or a similar geometric UI font.
- Favor bold uppercase labels for section markers and compact metadata.
- Use large, tight, confident headings where the screen calls for a major product state or page title.
- Keep dense admin controls smaller and more utilitarian; do not use oversized display text inside tables,
  forms, sidebars, buttons, or compact panels.

Layout and interaction direction:

- Keep the app useful as the first screen, not a marketing landing page.
- Use structured admin-console layouts with strong contrast and crisp section boundaries.
- Use cards only for repeated records, modals, or framed tools; do not nest cards.
- Use icons from `lucide-react` for action buttons when icons are needed.
- OAuth/provider connection UI is disabled for now; keep auth screens focused on email/password login.

Implementation notes for later:

- If the `story-scroll` component is actually integrated, it belongs under `frontend/components/ui/story-scroll.tsx`.
- It requires `gsap` and `@gsap/react`.
- The component is client-only and uses `ScrollTrigger`, `useGSAP`, `window.matchMedia`, and reduced-motion handling.
- It should not replace the core app shell by default; it is better suited to an onboarding, intro, or showcase flow.
- Tailwind setup should keep global font variables in the app stylesheet, but avoid importing animation packages
  unless they are actually installed and used.

## Legacy Claude Reference

The notes below are historical reference only. They should not be treated as the desired future
HumanTouch visual direction unless explicitly requested.

## Claude Typography Reference

Verified from the live Claude product site by inspecting loaded fonts and computed styles on `https://claude.com/product/overview`.

- UI/body font: `"Anthropic Sans", Arial, sans-serif`
- Display/hero font: `"Anthropic Serif", Georgia, serif`
- Mono/code font: `"Anthropic Mono"`

Verified font asset URLs:

- `https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/69971989be3c6573c3128fd9_AnthropicSans-Roman-Web.woff2`
- `https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/6997199fab1923a705f0042d_AnthropicSerif-Roman-Web.woff2`
- `https://cdn.prod.website-files.com/6889473510b50328dbb70ae6/699719b721a24ad1b6ce2c47_AnthropicMono-Roman-Web.woff2`

Computed style snapshot from the live page:

- `body` font family: `"Anthropic Sans", Arial, sans-serif`
- `body` background: `rgb(250, 249, 245)`
- `body` text color: `rgb(20, 20, 19)`
- `h1` font family: `"Anthropic Serif", Georgia, sans-serif`
- `h1` font size: `47.5px`
- `h1` font weight: `500`

## Claude UI Notes From The Reference Screenshot

- Background should feel warm charcoal, not blue-black.
- Text should be muted ivory/beige, not bright white.
- Large greeting uses a soft editorial serif with generous spacing.
- Sidebar should be plain, quiet, and list-driven.
- The prompt box should be the main focal object: large, rounded, centered, and calm.
- Accent use should be minimal; one warm orange highlight is enough.

## Sources

- Anthropic product page: https://claude.com/product/overview
- Anthropic help center note that Claude supports chat font modes: https://support.anthropic.com/en/articles/9061749-how-can-i-switch-the-font-on-claude-ai
