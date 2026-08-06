# Dashboard Design Contract

The dashboard follows the Emil editorial system. This document is the frontend contract for future dashboard changes; implementation changes must preserve the existing IDs, translations, API behavior, and save/restart flow.

## Color tokens

Use the shared CSS custom properties rather than introducing local theme colors.

| Token      | Value     | Role                                                       |
| ---------- | --------- | ---------------------------------------------------------- |
| `--ink`    | `#28231f` | Hero, primary text, and decisive controls                  |
| `--canvas` | `#f1ede5` | Page canvas                                                |
| `--paper`  | `#fffdf8` | Cards, fields, and fold surfaces                           |
| `--rust`   | `#9f4d2e` | Editorial accents, destructive actions, disclosure markers |
| `--teal`   | `#1f6f78` | Selected and positive interactive states                   |
| `--gold`   | `#b57920` | Metadata, focus rings, and restart emphasis                |

Rules use `#d9d0c4`; muted copy uses `#6d665e`. Shadows stay restrained at `0 14px 34px rgba(65,49,35,.10)`. Do not add gradients, generic purple, or decorative pill collections.

## Typography

- Body, headings, and editorial hierarchy use Georgia with Times New Roman and `serif` fallbacks.
- Interface metadata, compact labels, counters, and controls use the system sans stack.
- Machine values and state tokens use the monospace stack.
- Headings use tight tracking and compact line height; labels use small uppercase sans text.

## Spacing and materials

- The warm canvas surrounds a centered page with a maximum width of 1120px.
- The dark hero includes a low-opacity inset hairline frame. Its metadata uses gold and rust accents.
- Cards use the paper surface, a dark top rule, and one restrained shadow. Avoid nested ornamental containers.
- Use the 4/8/12/16/24/32px rhythm. Dense controls may use the smaller steps; primary sections use 16px or more.
- Controls are square-edged editorial elements, not pills. Borders and spacing establish hierarchy before color.

## Provider folds

- Models are grouped by their provider and provider groups are sorted alphabetically with a stable explicit comparator.
- Every provider is a native `<details class="provider-fold">` with a native `<summary>` and no `open` attribute, so initial state is closed.
- Summary text is visibly `Provider (enabled/total)` and exposes `data-provider`, `data-enabled`, and `data-total` for machine consumption.
- The rust plus/minus marker must clearly communicate collapsed and expanded state.
- Model IDs, notes, and toggles remain inside their provider fold.
- A model toggle updates configuration and the fold's enabled metadata/count in place. It must not rebuild the model container or call `render()`, because doing so would close an open fold.

## Accessibility

- Preserve semantic landmarks, sections, headings, labels, native details/summary behavior, and button/input elements.
- Every keyboard-operable element has a high-contrast gold `:focus-visible` outline with offset.
- Toggle checkboxes remain in the accessibility and keyboard trees; visual hiding may use opacity, never `display: none`.
- Color is never the only state indicator. Text, counters, disclosure markers, and enabled/disabled control states carry the same information.
- Respect `prefers-reduced-motion: reduce` by removing transitions and animations.
- Existing localized prose and ARIA labels remain translation-driven.

## Responsive behavior

- Below 760px, sections form one column and provider model rows form one column.
- At 760px and above, the server and routing editors share two columns; credentials and models span the page. Credential cards and provider model rows may use two columns.
- Below 560px, hero and card spacing contracts, headings stack, bind controls become one column, and credential controls wrap without overflow.
- Below 520px, save and restart actions share two columns while status text occupies the full row.
- Below 360px, compact language and API-key controls remain usable without horizontal scrolling.

## Change discipline

Visual renewal must not rename existing DOM IDs, alter API endpoints or payloads, replace translated strings, or change credential, routing, save, restart, and polling behavior. New visual behavior should be expressed through semantic HTML and CSS before adding JavaScript.
