# Design System Specification: The Vitality Curator

## 1. Overview & Creative North Star: "The Vitality Curator"
Most health and calorie-tracking apps feel like clinical spreadsheets—rigid, cold, and punishing. This design system departs from that utility-first exhaustion to embrace an **Editorial Wellness** aesthetic. We are building "The Vitality Curator."

Our Creative North Star is characterized by breathing room, sophisticated tonal layering, and an "Organic Brutalism" that favors bold, clear typography over decorative fluff. We move beyond the "template" look by using intentional asymmetry—such as offset calorie counts or overlapping card elements—to make the experience feel bespoke. The goal is to make the user feel like they are reading a high-end health journal, not filling out a tax return.

---

## 2. Colors: Tonal Depth & Vitality
The palette is rooted in a "Fresh-Forest" ethos. We use vibrant greens to signal life and health, balanced by a sophisticated range of cool greys and soft whites to maintain a lightweight feel.

*   **Primary Logic:** The `primary` (#006947) is our anchor of trust, used for high-importance actions. Its counterpart, `primary_container` (#69f6b8), provides the "vibrant" energy requested, acting as a high-visibility signal for progress bars and primary highlights.
*   **The "No-Line" Rule:** We do not use 1px solid borders to define sections. Period. Structure must be created through background shifts. For example, a card using `surface_container_lowest` (#ffffff) should sit on a background of `surface_container_low` (#eef1f3). This creates a "soft edge" that feels integrated and premium.
*   **Surface Hierarchy & Nesting:** Use the tiers (`lowest` to `highest`) to imply importance. A user’s daily summary card should live on `surface_container_lowest` to "pop" against the `surface` background, while secondary stats like "Fiber" or "Potassium" should reside on `surface_container` to appear more recessed.
*   **The Glass & Gradient Rule:** For floating navigation bars or celebratory modal overlays, use `surface` with a 70% opacity and a 20px backdrop-blur. To add "soul," use a subtle linear gradient from `primary` to `primary_container` (at a 135-degree angle) for hero-state backgrounds or significant "Goal Reached" CTAs.

---

## 3. Typography: The Friendly Authority
We pair **Lexend** (for personality and punch) with **Plus Jakarta Sans** (for data-heavy precision).

*   **Display & Headlines (Lexend):** These are your "Editorial" voices. Use `display-lg` and `headline-lg` to create focal points. The geometric, friendly nature of Lexend removes the "math stress" from calorie counting.
*   **Titles & Body (Plus Jakarta Sans):** This is your "Functional" voice. It provides the clarity needed for nutritional labels and ingredient lists. 
*   **Hierarchy as Identity:** Use high-contrast scaling. A `display-md` calorie number should sit next to a `label-sm` "kcal" unit. This dramatic difference in scale is what creates the "premium" look—avoid making everything a similar, "safe" size.

---

## 4. Elevation & Depth: Tonal Layering
Traditional drop shadows are often a crutch for poor layout. In this design system, we prioritize **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by stacking. 
    *   *Level 0:* `surface` (The canvas).
    *   *Level 1:* `surface_container_low` (Section backgrounds).
    *   *Level 2:* `surface_container_lowest` (Interactive cards/Active elements).
*   **Ambient Shadows:** If a card must float (e.g., a "Quick Add" button), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(44, 47, 49, 0.06)`. Note the 6% opacity; it should be felt, not seen.
*   **The "Ghost Border" Fallback:** If a layout feels too "bleary," you may use a Ghost Border. Use the `outline_variant` (#abadaf) at 15% opacity. This provides a whisper of a boundary without the harshness of a standard stroke.
*   **Glassmorphism:** Apply to top-level navigation headers. Using a blur effect allows the vibrant greens of the content to peek through as the user scrolls, creating a sense of continuity and "lightweight" transparency.

---

## 5. Components: The Building Blocks

*   **Buttons:** 
    *   **Primary:** Use `primary` with `on_primary` text. Apply the `full` (9999px) roundedness for an approachable, pill-shaped feel.
    *   **Secondary:** Use `secondary_container` with `on_secondary_container`. No border.
*   **Input Fields:** Avoid the "box." Use `surface_container` as the fill, a `md` (0.75rem) corner radius, and `on_surface_variant` for placeholder text. The active state should transition the background to `surface_container_high` rather than just adding a border.
*   **Chips:** Essential for "Keto," "Vegan," or "High Protein" tags. Use `secondary_fixed_dim` for the background and `on_secondary_fixed` for text. These should be `full` rounded.
*   **Cards & Lists (The Divider Ban):** Do not use horizontal rules (`<hr>`). Separate list items using 16px of vertical white space (from our Spacing Scale) or by alternating subtle background shades between `surface_container_low` and `surface_container`.
*   **Health Trackers (Custom Component):** For the calorie ring or progress bar, use `primary_container` for the "track" and `primary` for the "progress." This tone-on-tone approach feels much more sophisticated than green-on-grey.

---

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical margins. A headline might be indented more than the body text to create an editorial feel.
*   **Do** use `tertiary` (#815100) sparingly for "Warning" or "High Sugar" alerts—it’s an organic, earthy orange that fits the health theme better than a jarring "Error" red.
*   **Do** embrace white space. If you think there's enough space, add 8px more.

### Don't:
*   **Don't** use pure black (#000000) for text. Use `on_surface` (#2c2f31) to maintain the soft, premium feel.
*   **Don't** use the `DEFAULT` (0.5rem) roundedness for everything. Use `xl` (1.5rem) for large cards and `full` for buttons to emphasize the "friendly/modern" vibe.
*   **Don't** use standard "Material Design" shadows. Stick to Tonal Layering first, and Ghost Borders second.

This design system is a living document. Its success depends on your ability to resist the urge to "box things in." Let the typography breathe, let the colors bleed, and keep the user's journey lightweight.