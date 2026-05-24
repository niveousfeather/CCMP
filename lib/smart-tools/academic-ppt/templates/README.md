# Academic PPT Template Notes

This directory documents the template ideas used by the NexusAI academic-ppt renderer.

## Sources

- `paper-ppt-agent` by CRui5in, MIT License.
  - Local package inspected: `paper-ppt-agent-master (1).zip`
  - Reference paths:
    - `assets/templates/layouts/layouts_index.json`
    - `assets/templates/layouts/*/design_spec.md`
    - `assets/templates/charts/charts_index.json`
    - `assets/templates/design_spec_reference.md`
- `PPTAgent` by icip-cas, referenced for the idea of analyzing a reference presentation's structure/schema before generating slides.

## Imported Assets

No full upstream repository and no Python or React runtime is copied into NexusAI.

The current implementation only codifies a small, derived template registry and layout rules under:

```text
lib/smart-tools/academic-ppt/template-registry.ts
lib/smart-tools/academic-ppt/ppt-theme.ts
lib/smart-tools/academic-ppt/layout-planner.ts
lib/smart-tools/academic-ppt/text-layout.ts
```

## Template Mapping

- `academic_clean` -> `academic_defense`
- `blue_tech` -> `tech_blue_business`
- `research_report` -> `mckinsey`
- `course_presentation` -> `google_style`
- `school_academic_report` -> sanitized built-in PPTX template constraints

`chongqing_university` is kept as an additional academic reference theme for future UI exposure.

## Built-in Sanitized PPTX Templates

The first built-in school template is registered as:

```text
services/ai-tools-engine/app/tools/academic_ppt/templates/builtin/school_academic_report/
  template.pptx
  template.json
```

`template.pptx` is a sanitized copy of the user-provided institutional template. Source example text, names, phone/email-like content, course/project wording, and original sample business text are replaced by standardized placeholders such as `{{TITLE}}`, `{{SLIDE_TITLE}}`, `{{BODY}}`, `{{KEY_POINTS}}`, and `{{FOOTER}}`.

The PPTX keeps masters, layouts, theme colors, embedded font entries, logos/backgrounds/media, page ratio, and decoration structure. Embedded fonts remain inside the PPTX package only; no standalone font files are exported or committed.

The current paper-ppt-agent integration does not rewrite vendor core or make the vendor consume the PPTX directly. The adapter verifies `template.json` and `template.pptx`, then injects the template palette, font policy, layout roles, and institutional style constraints into the existing native paper-ppt-agent generation path.

## Design Ideas Absorbed

- 1280 x 720 design baseline.
- Safe areas and title/content/footer regions.
- Standard page types: cover, toc/agenda, chapter/section, content, ending/summary.
- Header bars, key-message strips, diagonal/gradient decorations, four-color Google accents, consulting-style top rules.
- Chart/visual intent mapping inspired by `charts_index.json`: KPI cards, tables, formulas, process flows, architecture diagrams, timelines, comparisons, matrices, and SWOT.

The renderer generates PPTX shapes directly and does not render upstream SVG templates.
