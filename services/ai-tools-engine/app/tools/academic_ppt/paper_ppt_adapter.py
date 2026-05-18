from __future__ import annotations

import asyncio
import json
import math
import os
import re
import shutil
import sys
import textwrap
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from app.core.checkpoints import write_checkpoint
from app.core.config import get_settings
from app.core.diagnostics import format_missing_dependency_message, get_academic_ppt_diagnostics
from app.core.errors import sanitize_message
from app.core.files import safe_task_child
from app.core.model_bridge import NexusModelBridgeProvider
from app.core.search_bridge import run_academic_search_bridge
from app.tools.academic_ppt.logs import append_log


def _product_log_message(message: str) -> str:
    if message.startswith("Template ") and " loaded" in message:
        return "Template selected."
    return message


def _check_paper_ppt_agent_dependencies() -> None:
    diagnostics = get_academic_ppt_diagnostics()
    if diagnostics.missing_agent:
        raise RuntimeError("paper-ppt-agent local package was not found.")
    if diagnostics.missing_dependencies:
        raise RuntimeError(format_missing_dependency_message(diagnostics.missing_dependencies))


def _ensure_paper_ppt_agent_importable() -> Path:
    _check_paper_ppt_agent_dependencies()
    settings = get_settings()
    root = settings.paper_ppt_agent_root
    if not (root / "backend" / "orchestrator" / "pipeline.py").exists():
        raise RuntimeError("paper-ppt-agent local package was not found.")
    root_str = str(root)
    if root_str not in sys.path:
        sys.path.insert(0, root_str)
    return root


@contextmanager
def _paper_agent_import_context():
    """Import paper-ppt-agent without letting it read the NexusAI root .env."""
    previous_cwd = Path.cwd()
    engine_root = Path(__file__).resolve().parents[3]
    os.chdir(engine_root)
    try:
        yield
    finally:
        os.chdir(previous_cwd)


def _patch_paper_ppt_agent_runtime(task_dir: Path, model_bridge_url: str | None) -> None:
    _ensure_paper_ppt_agent_importable()

    with _paper_agent_import_context():
        import backend.llm.registry as registry
        import backend.orchestrator.svg_executor as svg_executor
        from backend.config import settings as paper_settings

    paper_root = get_settings().paper_ppt_agent_root
    runtime_dir = safe_task_child(task_dir, "checkpoints", "paper-runtime")
    workspaces_dir = safe_task_child(task_dir, "checkpoints", "paper-workspaces")

    paper_settings.assets_dir = paper_root / "assets"
    paper_settings.templates_dir = paper_root / "assets" / "templates"
    paper_settings.icons_dir = paper_root / "assets" / "icons"
    paper_settings.references_dir = paper_root / "assets" / "references"
    paper_settings.runtime_dir = runtime_dir
    paper_settings.workspaces_dir = workspaces_dir

    registry._PROVIDER_IMPORTS["nexus"] = ("app.core.model_bridge", "NexusModelBridgeProvider")
    registry._PROVIDER_INFO["nexus"] = NexusModelBridgeProvider(
        api_key="nexus-task",
        base_url=model_bridge_url or "",
    ).get_provider_info()

    original_create_provider = getattr(
        registry,
        "_nexusai_original_create_provider",
        registry.create_provider,
    )
    registry._nexusai_original_create_provider = original_create_provider

    def create_provider_with_nexus(
        name: str,
        api_key: str,
        *,
        base_url: str | None = None,
        deepseek_settings: dict | None = None,
        openai_settings: dict | None = None,
    ):
        if name == "nexus":
            return NexusModelBridgeProvider(api_key=api_key, base_url=base_url or model_bridge_url or "")
        return original_create_provider(
            name,
            api_key,
            base_url=base_url,
            deepseek_settings=deepseek_settings,
            openai_settings=openai_settings,
        )

    registry.create_provider = create_provider_with_nexus
    _patch_paper_ppt_agent_svg_executor(svg_executor)


def _patch_paper_ppt_agent_svg_executor(svg_executor: Any) -> None:
    if getattr(svg_executor, "_nexusai_chapter_detector_patched", False):
        return

    def detect_chapter_pages_from_intent(design_spec: str, total_pages: int) -> set[int]:
        chapter_pages: set[int] = set()
        slide_blocks = re.split(
            r"(?=^\s*#{2,6}\s+Slide\s+\d+\b|^\s*[-*]\s*Slide\s+\d+\b)",
            design_spec,
            flags=re.IGNORECASE | re.MULTILINE,
        )
        section_terms = (
            "section divider",
            "chapter divider",
            "section transition",
            "chapter transition",
            "part divider",
            "divider page",
            "\u7ae0\u8282\u8fc7\u6e21",
            "\u7ae0\u8282\u9875",
            "\u5206\u7ae0\u9875",
            "\u8fc7\u6e21\u9875",
        )
        body_terms = (
            "**content**",
            "content:",
            "visualization",
            "left-right split",
            "top-bottom split",
            "cards",
            "matrix",
            "process",
            "comparison",
            "\u6b63\u6587",
            "\u56fe\u8868",
            "\u65b9\u6cd5",
            "\u8bc1\u636e",
            "\u53d1\u73b0",
            "\u5bf9\u6bd4",
        )
        for block in slide_blocks:
            match = re.search(r"\bSlide\s+(\d+)\b", block, flags=re.IGNORECASE)
            if not match:
                continue
            page_num = int(match.group(1))
            if page_num <= 1 or page_num >= total_pages:
                continue
            head = "\n".join(block.splitlines()[:16])
            lower_head = head.lower()
            has_section_intent = any(term in lower_head or term in head for term in section_terms)
            has_body_intent = any(term in lower_head or term in head for term in body_terms)
            if has_section_intent and not has_body_intent:
                chapter_pages.add(page_num)
        return chapter_pages

    svg_executor._detect_chapter_pages = detect_chapter_pages_from_intent
    svg_executor._nexusai_chapter_detector_patched = True


def _escape_latex_text(text: str) -> str:
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(ch, ch) for ch in text)


def _text_to_tex(input_path: Path, task_dir: Path) -> Path:
    text = input_path.read_text(encoding="utf-8", errors="ignore")
    title = input_path.stem.replace("_", " ").strip() or "Academic Presentation"
    paragraphs = [item.strip() for item in re.split(r"\n\s*\n+", text) if item.strip()]
    abstract = paragraphs[0][:1800] if paragraphs else text[:1800]
    body = paragraphs[1:] if len(paragraphs) > 1 else paragraphs
    section_chunks: list[str] = []

    for index, paragraph in enumerate(body[:24], start=1):
        heading = f"Section {index}"
        lines = paragraph.splitlines()
        first = lines[0].strip() if lines else ""
        if first.startswith("#"):
            heading = first.lstrip("#").strip()[:80] or heading
            paragraph = "\n".join(lines[1:]).strip() or paragraph
        section_chunks.append(
            f"\\section{{{_escape_latex_text(heading)}}}\n{_escape_latex_text(paragraph[:3000])}"
        )

    if not section_chunks:
        section_chunks.append(f"\\section{{Overview}}\n{_escape_latex_text(text[:3000])}")

    tex_path = safe_task_child(task_dir, "checkpoints", "normalized-source.tex")
    tex_path.write_text(
        "\n".join(
            [
                r"\documentclass{article}",
                f"\\title{{{_escape_latex_text(title)}}}",
                r"\author{NexusAI}",
                r"\begin{document}",
                r"\maketitle",
                r"\begin{abstract}",
                _escape_latex_text(abstract),
                r"\end{abstract}",
                *section_chunks,
                r"\end{document}",
            ]
        ),
        encoding="utf-8",
    )
    write_checkpoint(
        task_dir,
        "source-parsed",
        {"sourceType": "latex", "normalizedFrom": input_path.suffix.lower(), "fileName": tex_path.name},
    )
    return tex_path


def _pptx_to_tex(input_path: Path, task_dir: Path) -> Path:
    try:
        from pptx import Presentation

        presentation = Presentation(str(input_path))
        chunks: list[str] = []
        for index, slide in enumerate(presentation.slides, start=1):
            texts: list[str] = []
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text:
                    texts.append(shape.text)
            if texts:
                chunks.append(f"# Slide {index}\n" + "\n".join(texts))
    except Exception as exc:
        raise RuntimeError(f"PPTX text extraction failed: {sanitize_message(exc)}") from exc

    extracted = "\n\n".join(chunks) or input_path.stem
    temp_md = safe_task_child(task_dir, "checkpoints", "normalized-pptx.md")
    temp_md.write_text(extracted, encoding="utf-8")
    return _text_to_tex(temp_md, task_dir)


def _normalize_input_for_paper_agent(input_path: Path, task_dir: Path) -> tuple[Path, str]:
    suffix = input_path.suffix.lower()
    if suffix == ".pdf":
        write_checkpoint(task_dir, "source-parsed", {"sourceType": "pdf", "fileName": input_path.name})
        return input_path, "pdf"
    if suffix in {".tex", ".zip", ".tgz"} or input_path.name.lower().endswith(".tar.gz"):
        write_checkpoint(task_dir, "source-parsed", {"sourceType": "latex", "fileName": input_path.name})
        return input_path, "latex"
    if suffix in {".txt", ".md", ".markdown"}:
        return _text_to_tex(input_path, task_dir), "latex"
    if suffix == ".pptx":
        return _pptx_to_tex(input_path, task_dir), "latex"
    raise RuntimeError(f"Unsupported academic-ppt input type: {suffix or input_path.name}")


def _canvas_format(settings: dict[str, Any]) -> str:
    return "ppt43" if settings.get("aspectRatio") == "4:3" else "ppt169"


def _detail_level(settings: dict[str, Any]) -> str:
    detail = settings.get("detailLevel")
    density = settings.get("informationDensity")
    if detail == "detailed" or density == "high":
        return "high"
    return "normal"


def _style(settings: dict[str, Any]) -> str:
    style = settings.get("templateStyle")
    if style == "blue_tech":
        return "tech"
    if style == "research_report":
        return "consulting"
    return "academic"


def _template_id(settings: dict[str, Any]) -> str | None:
    mapping = {
        "academic_clean": "academic_defense",
        "blue_tech": "\u79d1\u6280\u84dd\u5546\u52a1",
        "research_report": "mckinsey",
        "course_presentation": "google_style",
    }
    return mapping.get(str(settings.get("templateStyle") or ""))


def _instruction(settings: dict[str, Any]) -> str:
    extras = str(settings.get("extraRequirements") or "").strip()
    flags = []
    if settings.get("enableDeepResearch"):
        flags.append("Use a deeper academic narrative with background, method, evidence, limitations, and conclusion.")
    if settings.get("enableExternalResearch"):
        flags.append("Use only server-provided context. Do not invent citations or external facts.")
    if settings.get("enableIconDecoration"):
        flags.append("Use restrained academic iconography where helpful.")
    if extras:
        flags.append(extras)
    flags.append(_slide_composition_guardrails(settings))
    flags.append(_visual_quality_guardrails(settings))
    return "\n".join(flags)


def _slide_composition_guardrails(settings: dict[str, Any]) -> str:
    target = max(1, int(settings.get("targetSlides") or 12))
    min_content = max(1, math.ceil(target * 0.55)) if target >= 8 else max(1, target - 3)
    max_sections = max(1, math.floor(target * 0.30)) if target >= 8 else 2
    max_outline = max(1, math.floor(target * 0.35)) if target >= 8 else 2
    return "\n".join(
        [
            "## NexusAI slide composition guardrails",
            f"- The requested deck has exactly {target} pages. Do not convert most pages into chapter dividers.",
            "- Recommended 12-page academic structure: 1 cover, 1 agenda, at most 2-3 section divider pages, 6-8 content/evidence pages, and 1 summary/ending page.",
            f"- For this request, produce at least {min_content} body content slides.",
            f"- Section divider/chapter-only slides must be no more than {max_sections}.",
            f"- Outline-only pages must be no more than {max_outline}.",
            "- A body content slide must include a clear title plus 3-5 concrete points from the manuscript.",
            "- Every body content slide must include at least one of: method, evidence, finding, figure, chart, comparison, implication, or conclusion.",
            "- Do not make a slide that only has a page number, PART label, chapter title, and subtitle unless it is explicitly one of the limited section divider pages.",
            "- For long papers, extract details from the manuscript into body slides instead of summarizing every chapter as a divider.",
            "- In the design_spec, label each page intent clearly as cover, agenda, section, content, evidence, method, findings, summary, or ending.",
        ]
    )


def _visual_quality_guardrails(settings: dict[str, Any]) -> str:
    language = "Chinese" if settings.get("outputLanguage") != "en" else "English"
    lines = [
        "## NexusAI visual quality guardrails",
        "These are design-quality constraints for the native paper-ppt-agent pipeline; keep all visible slide text in "
        f"{language}.",
        "- Readability comes first: every title, body line, caption, label, number, and footnote must remain readable on its background.",
        "- Use high-contrast title colors and medium-high-contrast body colors. Avoid dark text on deep blue or black backgrounds, pale gray text on light backgrounds, and low-opacity body text.",
        "- Cover pages need clear title, subtitle, and metadata hierarchy; the title should be the strongest text element.",
        "- Section-page large numbers are visual aids: keep them behind, beside, or clearly separated from the main title, never on top of readable text.",
        "- Agenda, summary, and closing pages should have balanced whitespace, consistent list spacing, and a clear visual anchor.",
        "- KPI cards, charts, flows, process diagrams, and comparison panels must be visibly separated from the page background with sufficient fill, stroke, or shadow contrast.",
        "- Keep information density balanced: avoid sparse empty slides, but do not pack text to the edges or exceed the content area.",
        "- Strict visual mode: do not emit a rule-fallback, plain white, or basic parsed-text design. If the visual strategy or SVG plan cannot be completed, fail cleanly so the task can be resumed.",
    ]
    if settings.get("templateStyle") == "blue_tech":
        lines.extend(
            [
                "## Dark blue template contrast rules",
                "- On dark or blue gradient backgrounds, title text must be #FFFFFF or a near-white high-contrast color.",
                "- On dark or blue gradient backgrounds, subtitle/body text must be #DCEBFF, #EAF4FF, or similarly light high-contrast text.",
                "- Do not place #0B1220, #172554, dark navy, or black text directly on dark blue backgrounds.",
                "- Agenda, summary, and section divider pages need separate color handling: agenda list text may use dark text only inside light cards; section and ending titles on dark backgrounds must stay white.",
                "- Large decorative numbers are decorative_number elements only: use low opacity and keep them behind title/subtitle text.",
                "- Section divider layer order is fixed: background, decorative_number, accent line or Part label, subtitle, title. The title is always the top readable layer.",
                "- Keep decorative numbers away from the title bounding box where possible; if they intersect, reduce opacity below 0.12 and draw title/subtitle after the number.",
                "- Part labels and accent rules may use cyan/blue accents, but title and subtitle on dark blue backgrounds must use the light text palette.",
                "- If a page uses a dark image or dark blue background, add a contrast panel or overlay before placing readable text.",
            ]
        )
    return "\n".join(lines)


def _blue_tech_style_overrides() -> dict[str, Any]:
    return {
        "title": "#FFFFFF",
        "subtitle": "#DCEBFF",
        "body": "#EAF4FF",
        "body_on_light": "#0B1220",
        "secondary_text": "#BFDBFE",
        "muted_text": "#BFD7FF",
        "accent": "#22D3EE",
        "accent_cyan": "#3DDCFF",
        "accent_alt": "#60A5FA",
        "accent_blue": "#5DB8FF",
        "card_fill": "#F8FAFC",
        "card_text": "#0B1220",
        "forbidden_dark_text_on_dark_background": ["#000000", "#020617", "#0B1220", "#0F172A", "#111827", "#172554", "#1E293B"],
        "decorative_number": {
            "fill": "#FFFFFF",
            "opacity": 0.08,
            "max_opacity_when_overlapping_text": 0.12,
            "layer": "behind_text",
            "z_index": 1,
        },
        "section_divider_layers": {
            "background": 0,
            "decorative_number": 1,
            "part_label": 2,
            "accent_rule": 2,
            "subtitle": 3,
            "title": 4,
        },
    }


def _visual_quality_style_overrides(settings: dict[str, Any]) -> dict[str, Any]:
    style = str(settings.get("templateStyle") or "academic_clean")
    density = "compact" if settings.get("informationDensity") == "high" else "normal"
    common = {
        "font_heading": "Aptos Display",
        "font_body": "Aptos",
        "cjk_heading": "Microsoft YaHei",
        "cjk_body": "Microsoft YaHei",
        "density": density,
        "readability_rules": [
            "Text must remain readable on its background.",
            "Use high contrast for titles and medium-high contrast for body text.",
            "Section-page large numbers must not overlap the main title.",
            "Cards, charts, and process panels need visible separation from the page background.",
            "For dark blue backgrounds, titles must be white and body text must use #DCEBFF or #EAF4FF.",
            "For section divider slides, draw decorative numbers before title/subtitle and keep the title visually on top.",
        ],
    }
    palettes = {
        "academic_clean": ["#F8FAFC", "#0F172A", "#1D4ED8", "#0F766E", "#334155", "#E2E8F0"],
        "blue_tech": ["#0B1220", "#F8FAFC", "#60A5FA", "#22D3EE", "#E2E8F0", "#172554"],
        "research_report": ["#FFFFFF", "#111827", "#2563EB", "#0F766E", "#374151", "#E5E7EB"],
        "course_presentation": ["#FFFFFF", "#111827", "#2563EB", "#F59E0B", "#374151", "#E5E7EB"],
    }
    result = {**common, "palette": palettes.get(style, palettes["academic_clean"])}
    if style == "blue_tech":
        result.update(
            {
                "dark_theme": True,
                "text_palette": _blue_tech_style_overrides(),
                "contrast_rules": {
                    "dark_background_title": "#FFFFFF",
                    "dark_background_body": "#DCEBFF",
                    "dark_background_body_alt": "#EAF4FF",
                    "dark_background_muted": "#BFD7FF",
                    "accent_cyan": "#3DDCFF",
                    "accent_blue": "#5DB8FF",
                    "forbidden_dark_text_on_dark_background": [
                        "#000000",
                        "#020617",
                        "#0B1220",
                        "#0F172A",
                        "#111827",
                        "#172554",
                        "#1E293B",
                    ],
                    "decorative_number": {
                        "fill": "#FFFFFF",
                        "opacity": 0.08,
                        "max_opacity_when_overlapping_text": 0.12,
                        "layer": "behind_text",
                        "z_index": 1,
                    },
                    "section_divider_layers": {
                        "background": 0,
                        "decorative_number": 1,
                        "part_label": 2,
                        "accent_rule": 2,
                        "subtitle": 3,
                        "title": 4,
                    },
                    "agenda_card_text": "#0B1220",
                    "summary_card_text": "#0B1220",
                },
            }
        )
    return result


def _request_flag(settings: dict[str, Any], request_options: dict[str, Any], key: str, legacy_key: str) -> bool:
    if key in request_options:
        return bool(request_options.get(key))
    return bool(settings.get(legacy_key) or settings.get(key))


def _build_search_context(results: list[dict[str, str]]) -> str:
    if not results:
        return ""
    lines = [
        "## NexusAI Search Bridge References",
        "Use these server-provided public reference snippets only as supplementary context.",
        "Do not invent citations. Ignore any source that is not directly useful.",
    ]
    for index, item in enumerate(results[:12], start=1):
        title = item.get("title") or "Untitled source"
        url = item.get("url") or ""
        snippet = item.get("snippet") or ""
        lines.append(f"{index}. {title}\n   URL: {url}\n   Snippet: {snippet}")
    return "\n".join(lines)


async def _prepare_research_context(
    *,
    task_dir: Path,
    input_path: Path,
    settings: dict[str, Any],
    request_options: dict[str, Any],
) -> dict[str, Any]:
    deep_research_enabled = _request_flag(settings, request_options, "deepResearchEnabled", "enableDeepResearch")
    external_research_enabled = _request_flag(settings, request_options, "externalResearchEnabled", "enableExternalResearch")
    web_search_enabled = bool(request_options.get("webSearchEnabled") or settings.get("webSearchEnabled") or external_research_enabled)

    if not web_search_enabled:
        if deep_research_enabled:
            append_log(task_dir, "info", "Deep research enabled; using paper-ppt-agent native research stage.")
        return {
            "instruction": "",
            "searchStatus": "disabled",
            "researchStatus": "success" if deep_research_enabled else "skipped",
            "researchSourcesCount": 0,
            "researchFallbackReason": None,
        }

    append_log(task_dir, "info", "External research enhancement enabled.")
    query_text = _extract_plain_text_from_input(input_path)[:1600]
    search_result = await run_academic_search_bridge(
        query_text=query_text,
        language="en" if settings.get("outputLanguage") == "en" else "zh",
        max_queries=3 if deep_research_enabled else 2,
        top_k=5,
    )
    append_log(task_dir, "info", f"Search bridge query count: {search_result.query_count}.")
    append_log(task_dir, "info", f"Search bridge usable documents: {search_result.documents_count}.")

    if search_result.status == "success":
        append_log(task_dir, "info", "Search bridge completed; references will inform the native pipeline.")
        return {
            "instruction": _build_search_context(search_result.results),
            "searchStatus": "success",
            "researchStatus": "success",
            "researchSourcesCount": search_result.documents_count,
            "researchFallbackReason": None,
        }

    fallback_reason = search_result.error_summary or "Search bridge returned no usable public sources."
    append_log(task_dir, "warn", "Search bridge degraded; continuing without external references.")
    return {
        "instruction": "",
        "searchStatus": "degraded",
        "researchStatus": "degraded",
        "researchSourcesCount": search_result.documents_count,
        "researchFallbackReason": fallback_reason,
    }


def _safe_output_file(task_dir: Path, raw_output_path: str | None) -> tuple[Path, int]:
    output_path = safe_task_child(task_dir, "outputs", "academic-ppt-result.pptx")
    if not raw_output_path:
        raise RuntimeError("paper-ppt-agent did not return a PPTX output.")

    source = Path(raw_output_path).resolve()
    paper_workspace = safe_task_child(task_dir, "checkpoints", "paper-workspaces")
    if not source.exists() or not source.is_file():
        raise RuntimeError("paper-ppt-agent PPTX output is missing.")
    try:
        source.relative_to(paper_workspace.resolve())
    except ValueError as exc:
        raise RuntimeError("paper-ppt-agent output path escaped task workspace.") from exc

    shutil.copy2(source, output_path)
    return output_path, output_path.stat().st_size


def _extract_slide_count(project_dir: str | None) -> int | None:
    if not project_dir:
        return None
    svg_final = Path(project_dir) / "svg_final"
    if svg_final.exists():
        count = len(list(svg_final.glob("*.svg")))
        return count or None
    return None


def _atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(f"{path.suffix}.tmp")
    temp.write_text(content, encoding="utf-8")
    temp.replace(path)


def _strict_visual_pipeline_enabled() -> bool:
    return get_settings().academic_ppt_strict_visual_pipeline


def _safe_relative_to_task(task_dir: Path, path: Path) -> str | None:
    try:
        return path.resolve().relative_to(task_dir.resolve()).as_posix()
    except ValueError:
        return None


def _project_file_metadata(task_dir: Path, project_dir: str | None) -> dict[str, Any]:
    if not project_dir:
        return {}
    project_path = Path(project_dir)
    metadata: dict[str, Any] = {}
    for key, file_name in (
        ("manuscript", "manuscript.md"),
        ("designSpec", "design_spec.md"),
        ("criticHistory", "critic_history.json"),
    ):
        file_path = project_path / file_name
        if not file_path.exists() or not file_path.is_file():
            metadata[key] = {"exists": False}
            continue
        metadata[key] = {
            "exists": True,
            "relativePath": _safe_relative_to_task(task_dir, file_path),
            "size": file_path.stat().st_size,
        }
    return metadata


def _svg_final_files(project_dir: str | None) -> list[Path]:
    if not project_dir:
        return []
    svg_final = Path(project_dir) / "svg_final"
    if not svg_final.exists():
        return []
    return sorted(svg_final.glob("*.svg"))


def _write_svg_preview_manifest(task_dir: Path, task_id: str, project_dir: str | None, slide_count: int | None) -> dict[str, Any] | None:
    svg_files = _svg_final_files(project_dir)
    if not svg_files:
        return None
    preview_dir = safe_task_child(task_dir, "previews")
    preview_dir.mkdir(parents=True, exist_ok=True)
    slides: list[dict[str, Any]] = []

    try:
        from backend.generator.svg_finalize.render_ready import prepare_svg_file_for_render
    except Exception:
        prepare_svg_file_for_render = None

    for zero_index, svg_file in enumerate(svg_files):
        page_number = zero_index + 1
        target = preview_dir / f"slide-{page_number:03d}.svg"
        source_for_copy = svg_file
        temp_render_path: Path | None = None
        if prepare_svg_file_for_render:
            try:
                temp_render_path = prepare_svg_file_for_render(svg_file)
                source_for_copy = temp_render_path
            except Exception:
                source_for_copy = svg_file
        try:
            _atomic_write_text(target, source_for_copy.read_text(encoding="utf-8", errors="ignore"))
        finally:
            if temp_render_path is not None:
                temp_render_path.unlink(missing_ok=True)
        slides.append(
            {
                "index": zero_index,
                "pageNumber": page_number,
                "url": f"/api/smart-tools/academic-ppt/tasks/{task_id}/preview/{page_number}",
                "imageUrl": f"/api/smart-tools/academic-ppt/tasks/{task_id}/preview/{page_number}",
                "assetPath": f"previews/slide-{page_number:03d}.svg",
                "source": "svg_final",
                "storageProvider": "local",
                "fileSizeBytes": target.stat().st_size,
            }
        )

    generated_at = __import__("datetime").datetime.utcnow().isoformat() + "Z"
    manifest = {
        "available": True,
        "taskId": task_id,
        "status": "ready",
        "type": "svg",
        "previewType": "svg",
        "source": "svg_final",
        "slideCount": len(slides),
        "previewCount": len(slides),
        "slides": slides,
        "pptxUrl": f"/api/smart-tools/academic-ppt/tasks/{task_id}/download",
        "previewManifestUrl": f"/api/smart-tools/academic-ppt/tasks/{task_id}/preview",
        "previewStoragePrefix": f"academic-ppt/tasks/{task_id}/previews",
        "storageProvider": "local",
        "fallbackReason": None,
        "createdAt": generated_at,
        "updatedAt": generated_at,
        "generatedAt": generated_at,
    }
    _atomic_write_text(preview_dir / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
    write_checkpoint(
        task_dir,
        "preview",
        {
            "type": "svg",
            "previewType": "svg",
            "slideCount": len(slides),
            "source": "paper-ppt-agent svg_final",
            "targetSlideCount": slide_count,
        },
    )
    return manifest


def _write_visual_pipeline_checkpoints(task_dir: Path, project_dir: str | None, slide_count: int | None) -> None:
    project_metadata = _project_file_metadata(task_dir, project_dir)
    svg_files = _svg_final_files(project_dir)
    composition = _assess_visual_composition_quality(project_dir, slide_count)
    write_checkpoint(
        task_dir,
        "visual-pipeline",
        {
            "project": project_metadata,
            "slideCount": slide_count,
            "svgFinalCount": len(svg_files),
            "contentSlides": composition["contentSlides"],
            "sectionDividerSlides": composition["sectionDividerSlides"],
            "outlineOnlySlides": composition["outlineOnlySlides"],
            "lowContrastTextElements": composition["lowContrastTextElements"],
            "compositionPassed": composition["passed"],
            "compositionIssues": composition["issues"],
            "designSpecComposition": composition["designSpec"],
            "strictVisualPipeline": _strict_visual_pipeline_enabled(),
        },
    )
    write_checkpoint(
        task_dir,
        "svg-final-index",
        {
            "slideCount": len(svg_files),
            "slides": [
                {
                    "index": index,
                    "fileName": svg_file.name,
                    "relativePath": _safe_relative_to_task(task_dir, svg_file),
                    "size": svg_file.stat().st_size,
                }
                for index, svg_file in enumerate(svg_files, start=1)
            ],
        },
    )


_BASIC_FALLBACK_MARKERS = (
    "model bridge was unavailable",
    "this basic deck is generated from parsed text",
    "rule fallback",
    "fallback generated from parsed text",
    "generated a basic structured deck from parsed text",
    "rule fallback -",
)


def _pptx_contains_basic_fallback_markers(output_file: Path) -> bool:
    try:
        with zipfile.ZipFile(output_file) as archive:
            text_parts: list[str] = []
            for name in archive.namelist():
                if not name.startswith("ppt/slides/") or not name.endswith(".xml"):
                    continue
                text_parts.append(archive.read(name).decode("utf-8", errors="ignore"))
        combined = " ".join(text_parts).lower()
        if any(marker in combined for marker in _BASIC_FALLBACK_MARKERS):
            return True
        return "basic deck" in combined and "generated from parsed text" in combined and "model bridge" in combined
    except Exception:
        return False


_BODY_CONTENT_KEYWORDS = (
    "method",
    "evidence",
    "finding",
    "result",
    "analysis",
    "comparison",
    "conclusion",
    "framework",
    "process",
    "chart",
    "figure",
    "table",
    "方法",
    "证据",
    "发现",
    "结果",
    "分析",
    "对比",
    "结论",
    "框架",
    "流程",
    "图",
    "表",
    "工艺",
    "设计",
    "实践",
    "方案",
    "分类",
    "问题",
    "目标",
    "创新",
    "贡献",
    "局限",
)
_AGENDA_KEYWORDS = ("agenda", "outline", "contents", "目录", "提纲", "大纲", "汇报提纲")
_ENDING_KEYWORDS = ("thanks", "thank you", "ending", "结束", "谢谢", "答辩结束")
_DARK_TEXT_ON_DARK_BG = {"#000000", "#020617", "#0b1220", "#0f172a", "#111827", "#172554", "#1e293b"}
_DARK_BG_MARKERS = (
    'fill="#0B1220"',
    "fill='#0B1220'",
    'stop-color="#0B1220"',
    "stop-color='#0B1220'",
    'fill="#172554"',
    "fill='#172554'",
    'stop-color="#172554"',
    "stop-color='#172554'",
    "chapterGradient",
    "dark",
)


def _plain_svg_text(svg: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for match in re.finditer(r"<(?:text|tspan)\b([^>]*)>([^<]*)", svg, flags=re.IGNORECASE | re.DOTALL):
        attrs = match.group(1) or ""
        text = re.sub(r"\s+", " ", match.group(2).replace("/text>", "").replace("/tspan>", "")).strip()
        if not text:
            continue
        fill_match = re.search(r"\bfill=[\"']([^\"']+)[\"']", attrs, flags=re.IGNORECASE)
        opacity_match = re.search(r"\bfill-opacity=[\"']([^\"']+)[\"']", attrs, flags=re.IGNORECASE)
        size_match = re.search(r"\bfont-size=[\"']?([0-9.]+)", attrs, flags=re.IGNORECASE)
        x_match = re.search(r"\bx=[\"']?([-0-9.]+)", attrs, flags=re.IGNORECASE)
        y_match = re.search(r"\by=[\"']?([-0-9.]+)", attrs, flags=re.IGNORECASE)
        opacity = 1.0
        if opacity_match:
            try:
                opacity = float(opacity_match.group(1))
            except ValueError:
                opacity = 1.0
        font_size = 16.0
        if size_match:
            try:
                font_size = float(size_match.group(1))
            except ValueError:
                font_size = 16.0
        items.append(
            {
                "text": text,
                "fill": (fill_match.group(1).strip().lower() if fill_match else ""),
                "opacity": opacity,
                "fontSize": font_size,
                "x": float(x_match.group(1)) if x_match else None,
                "y": float(y_match.group(1)) if y_match else None,
                "sourceIndex": match.start(),
            }
        )
    return items


def _svg_has_dark_background(svg: str) -> bool:
    return any(marker.lower() in svg.lower() for marker in _DARK_BG_MARKERS)


def _svg_number(value: str | None, default: float = 0.0) -> float:
    if not value:
        return default
    match = re.search(r"[-+]?\d*\.?\d+", value)
    if not match:
        return default
    try:
        return float(match.group(0))
    except ValueError:
        return default


def _svg_attr(attrs: str, name: str) -> str | None:
    match = re.search(rf"\b{name}=[\"']([^\"']+)[\"']", attrs, flags=re.IGNORECASE)
    return match.group(1).strip() if match else None


def _svg_opacity(attrs: str) -> float:
    return max(0.0, min(1.0, _svg_number(_svg_attr(attrs, "fill-opacity") or _svg_attr(attrs, "opacity"), 1.0)))


def _normalize_svg_color(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip().lower()
    short = re.fullmatch(r"#([0-9a-f])([0-9a-f])([0-9a-f])", value)
    if short:
        return "#" + "".join(channel * 2 for channel in short.groups())
    match = re.fullmatch(r"#[0-9a-f]{6}", value)
    return value if match else value


def _svg_color_luminance(fill: str) -> float | None:
    fill = _normalize_svg_color(fill)
    if not re.fullmatch(r"#[0-9a-f]{6}", fill):
        return None
    channels = [int(fill[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    linear = [value / 12.92 if value <= 0.03928 else ((value + 0.055) / 1.055) ** 2.4 for value in channels]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _is_dark_svg_fill(fill: str, svg: str) -> bool:
    fill = _normalize_svg_color(fill)
    if fill.startswith("url("):
        return _svg_has_dark_background(svg)
    luminance = _svg_color_luminance(fill)
    return luminance is not None and luminance < 0.18


def _svg_path_bounds(d: str) -> tuple[float, float, float, float] | None:
    tokens = re.findall(r"[A-Za-z]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?", d, flags=re.IGNORECASE)
    if not tokens:
        return None
    command_args = {
        "M": 2,
        "L": 2,
        "T": 2,
        "H": 1,
        "V": 1,
        "C": 6,
        "S": 4,
        "Q": 4,
        "A": 7,
    }
    points: list[tuple[float, float]] = []
    command = ""
    x = 0.0
    y = 0.0
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if re.fullmatch(r"[A-Za-z]", token):
            command = token
            index += 1
            continue
        if not command:
            index += 1
            continue

        upper_command = command.upper()
        arg_count = command_args.get(upper_command)
        if arg_count is None:
            index += 1
            continue
        args: list[float] = []
        lookahead = index
        while lookahead < len(tokens) and len(args) < arg_count and not re.fullmatch(r"[A-Za-z]", tokens[lookahead]):
            args.append(float(tokens[lookahead]))
            lookahead += 1
        if len(args) < arg_count:
            index = lookahead + 1 if lookahead == index else lookahead
            continue

        relative = command.islower()
        if upper_command in {"M", "L", "T"}:
            x = x + args[-2] if relative else args[-2]
            y = y + args[-1] if relative else args[-1]
            points.append((x, y))
        elif upper_command == "H":
            x = x + args[0] if relative else args[0]
            points.append((x, y))
        elif upper_command == "V":
            y = y + args[0] if relative else args[0]
            points.append((x, y))
        elif upper_command in {"C", "S", "Q", "A"}:
            x = x + args[-2] if relative else args[-2]
            y = y + args[-1] if relative else args[-1]
            points.append((x, y))
        if upper_command == "M":
            command = "l" if relative else "L"
        index += arg_count
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _svg_background_shapes(svg: str) -> list[dict[str, Any]]:
    shapes: list[dict[str, Any]] = []
    for match in re.finditer(r"<(rect|path)\b([^>]*)>", svg, flags=re.IGNORECASE | re.DOTALL):
        tag = match.group(1).lower()
        attrs = match.group(2) or ""
        fill = _normalize_svg_color(_svg_attr(attrs, "fill"))
        if not fill or fill in {"none", "transparent"}:
            continue
        bounds: tuple[float, float, float, float] | None = None
        if tag == "rect":
            x = _svg_number(_svg_attr(attrs, "x"), 0.0)
            y = _svg_number(_svg_attr(attrs, "y"), 0.0)
            width = _svg_number(_svg_attr(attrs, "width"), 0.0)
            height = _svg_number(_svg_attr(attrs, "height"), 0.0)
            if width > 0 and height > 0:
                bounds = (x, y, x + width, y + height)
        elif tag == "path":
            bounds = _svg_path_bounds(_svg_attr(attrs, "d") or "")
        if not bounds:
            continue
        shapes.append({"sourceIndex": match.start(), "bounds": bounds, "fill": fill, "opacity": _svg_opacity(attrs)})
    return shapes


def _svg_text_background_is_dark(svg: str, item: dict[str, Any], shapes: list[dict[str, Any]]) -> bool:
    x = item.get("x")
    y = item.get("y")
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return _svg_has_dark_background(svg)
    for shape in reversed(shapes):
        if shape["sourceIndex"] > item["sourceIndex"] or shape["opacity"] < 0.25:
            continue
        left, top, right, bottom = shape["bounds"]
        if left <= x <= right and top <= y <= bottom:
            return _is_dark_svg_fill(shape["fill"], svg)
    return _svg_has_dark_background(svg)


def _low_contrast_text_count(svg: str, text_items: list[dict[str, Any]]) -> int:
    if not _svg_has_dark_background(svg):
        return 0
    shapes = _svg_background_shapes(svg)
    count = 0
    for item in text_items:
        fill = item["fill"]
        if (
            fill in _DARK_TEXT_ON_DARK_BG
            and item["opacity"] >= 0.45
            and item["fontSize"] >= 20
            and _svg_text_background_is_dark(svg, item, shapes)
        ):
            count += 1
    return count


def _classify_svg_slide(svg_file: Path, index: int, total: int) -> dict[str, Any]:
    svg = svg_file.read_text(encoding="utf-8", errors="ignore")
    text_items = _plain_svg_text(svg)
    texts = [item["text"] for item in text_items]
    combined = " ".join(texts)
    lower = combined.lower()
    meaningful_text_count = len([text for text in texts if len(text.strip()) >= 2])
    has_agenda = any(keyword in lower or keyword in combined for keyword in _AGENDA_KEYWORDS)
    has_ending = index == total or any(keyword in lower or keyword in combined for keyword in _ENDING_KEYWORDS)
    has_part = bool(re.search(r"\bpart\s*\d+\b|\bchapter\s*\d+\b|\bsection\s*\d+\b|章节|篇章", combined, flags=re.IGNORECASE))
    has_body_keyword = any(keyword in lower or keyword in combined for keyword in _BODY_CONTENT_KEYWORDS)
    is_cover = index == 1
    is_content = (not is_cover and not has_agenda and not has_ending and not has_part) and (
        meaningful_text_count >= 5 or (meaningful_text_count >= 4 and has_body_keyword)
    )
    is_section = (not is_cover and not has_agenda and not has_ending and not is_content) and (
        has_part or meaningful_text_count <= 4
    )
    is_outline_only = (has_agenda or (not is_cover and not has_ending and not is_content and meaningful_text_count <= 4))
    return {
        "index": index,
        "fileName": svg_file.name,
        "category": (
            "cover"
            if is_cover
            else "agenda"
            if has_agenda
            else "ending"
            if has_ending
            else "content"
            if is_content
            else "section"
            if is_section
            else "outline_only"
        ),
        "textCount": meaningful_text_count,
        "hasBodyKeyword": has_body_keyword,
        "lowContrastTextCount": _low_contrast_text_count(svg, text_items),
    }


def _assess_design_spec_composition(project_dir: str | None, target_slide_count: int | None) -> dict[str, Any]:
    if not project_dir:
        return {"available": False}
    design_spec = Path(project_dir) / "design_spec.md"
    if not design_spec.exists():
        return {"available": False}
    text = design_spec.read_text(encoding="utf-8", errors="ignore")
    slide_blocks = re.split(r"(?=####\s+Slide\s+\d+|###\s+Slide\s+\d+)", text, flags=re.IGNORECASE)
    slide_blocks = [block for block in slide_blocks if re.search(r"\bSlide\s+\d+\b", block, flags=re.IGNORECASE)]
    content_slides = 0
    section_divider_slides = 0
    outline_only_slides = 0
    for block in slide_blocks:
        block_lower = block.lower()
        is_cover = "cover" in block_lower
        is_agenda = any(keyword in block_lower or keyword in block for keyword in _AGENDA_KEYWORDS)
        is_ending = any(keyword in block_lower or keyword in block for keyword in _ENDING_KEYWORDS)
        is_section = "section" in block_lower or "chapter" in block_lower or "章节" in block
        has_content = bool(re.search(r"\*\*Content\*\*|Content:|内容|Visualization|可视化", block, flags=re.IGNORECASE))
        if not is_cover and not is_agenda and not is_ending and has_content and not is_section:
            content_slides += 1
        if not is_cover and not is_agenda and not is_ending and is_section:
            section_divider_slides += 1
        if is_agenda or (is_section and not has_content):
            outline_only_slides += 1
    return {
        "available": True,
        "totalSlides": len(slide_blocks) or target_slide_count,
        "contentSlides": content_slides,
        "sectionDividerSlides": section_divider_slides,
        "outlineOnlySlides": outline_only_slides,
    }


def _assess_visual_composition_quality(project_dir: str | None, target_slide_count: int | None) -> dict[str, Any]:
    svg_files = _svg_final_files(project_dir)
    total = len(svg_files)
    slide_assessments = [
        _classify_svg_slide(svg_file, index, total)
        for index, svg_file in enumerate(svg_files, start=1)
    ]
    content_slides = sum(1 for item in slide_assessments if item["category"] == "content")
    section_divider_slides = sum(1 for item in slide_assessments if item["category"] == "section")
    outline_only_slides = sum(1 for item in slide_assessments if item["category"] in {"agenda", "outline_only"})
    low_contrast_text = sum(int(item["lowContrastTextCount"]) for item in slide_assessments)
    requested = target_slide_count or total
    min_content = max(1, math.ceil(requested * 0.55)) if requested >= 8 else max(1, requested - 3)
    max_sections = max(1, math.floor(requested * 0.30)) if requested >= 8 else 2
    max_outline = max(1, math.floor(requested * 0.35)) if requested >= 8 else 2
    issues: list[str] = []
    if requested >= 8 and content_slides < min_content:
        issues.append(f"Only {content_slides} body content slides were detected; expected at least {min_content}.")
    if requested >= 8 and section_divider_slides > max_sections:
        issues.append(f"{section_divider_slides} section divider slides were detected; expected no more than {max_sections}.")
    if requested >= 8 and outline_only_slides > max_outline:
        issues.append(f"{outline_only_slides} outline-only slides were detected; expected no more than {max_outline}.")
    if low_contrast_text:
        issues.append(f"{low_contrast_text} dark-template text element(s) appear low contrast on dark backgrounds.")
    if target_slide_count and total > target_slide_count + max(1, math.floor(target_slide_count * 0.15)):
        issues.append(f"{total} SVG pages were generated for a {target_slide_count}-page request.")
    design_spec = _assess_design_spec_composition(project_dir, target_slide_count)
    if requested >= 8 and design_spec.get("available"):
        design_content = int(design_spec.get("contentSlides") or 0)
        design_sections = int(design_spec.get("sectionDividerSlides") or 0)
        design_outline = int(design_spec.get("outlineOnlySlides") or 0)
        if design_content < min_content:
            issues.append(
                f"Design spec planned only {design_content} body content slides; expected at least {min_content}."
            )
        if design_sections > max_sections:
            issues.append(
                f"Design spec planned {design_sections} section divider slides; expected no more than {max_sections}."
            )
        if design_outline > max_outline:
            issues.append(
                f"Design spec planned {design_outline} outline-only slides; expected no more than {max_outline}."
            )
    return {
        "contentSlides": content_slides,
        "sectionDividerSlides": section_divider_slides,
        "outlineOnlySlides": outline_only_slides,
        "lowContrastTextElements": low_contrast_text,
        "minContentSlides": min_content,
        "maxSectionDividerSlides": max_sections,
        "maxOutlineOnlySlides": max_outline,
        "slides": slide_assessments,
        "issues": issues,
        "passed": not issues,
        "designSpec": design_spec,
    }


def _visual_pipeline_status(project_dir: str | None, output_file: Path, target_slide_count: int | None = None) -> tuple[str, str | None, bool]:
    if _pptx_contains_basic_fallback_markers(output_file):
        return "degraded", "Model bridge unavailable; generated basic parsed-text deck.", True
    if not project_dir:
        return "degraded", "Visual pipeline project directory was not reported by paper-ppt-agent.", False

    project_path = Path(project_dir)
    manuscript = project_path / "manuscript.md"
    design_spec = project_path / "design_spec.md"
    svg_final = project_path / "svg_final"
    svg_files = list(svg_final.glob("*.svg")) if svg_final.exists() else []
    if not manuscript.exists() or manuscript.stat().st_size < 200:
        return "degraded", "Research manuscript was not generated.", False
    if not design_spec.exists() or design_spec.stat().st_size < 200:
        return "degraded", "Strategy design spec was not generated.", False
    if not svg_files:
        return "degraded", "SVG executor output was not generated.", False
    if target_slide_count and len(svg_files) < max(1, target_slide_count - 1):
        return "degraded", "SVG executor output is incomplete for the requested slide count.", False
    composition = _assess_visual_composition_quality(project_dir, target_slide_count)
    if not composition.get("passed", True):
        return "degraded", "Visual composition quality gate failed: " + "; ".join(composition.get("issues") or []), False
    return "success", None, False


def _read_model_bridge_snapshot(task_dir: Path) -> dict[str, Any]:
    task_json = task_dir / "task.json"
    try:
        data = json.loads(task_json.read_text(encoding="utf-8"))
    except Exception:
        return {}
    result: dict[str, Any] = {}
    for key in (
        "modelBridgeStatus",
        "modelBridgePrimaryModel",
        "modelBridgePrimaryStatus",
        "modelBridgeFallbackModel",
        "modelBridgeFallbackStatus",
        "modelBridgeErrorSummary",
    ):
        value = data.get(key)
        if value is not None:
            result[key] = value
    return result


def _extract_plain_text_from_input(input_path: Path) -> str:
    suffix = input_path.suffix.lower()
    if suffix in {".txt", ".md", ".markdown", ".tex"}:
        return input_path.read_text(encoding="utf-8", errors="ignore")
    if suffix == ".pptx":
        try:
            from pptx import Presentation

            presentation = Presentation(str(input_path))
            chunks: list[str] = []
            for index, slide in enumerate(presentation.slides, start=1):
                texts: list[str] = []
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text:
                        texts.append(shape.text)
                if texts:
                    chunks.append(f"Slide {index}\n" + "\n".join(texts))
            return "\n\n".join(chunks)
        except Exception:
            return input_path.stem
    if suffix == ".pdf":
        try:
            import fitz

            with fitz.open(str(input_path)) as doc:
                return "\n\n".join(page.get_text("text") for page in doc[:8])
        except Exception:
            return input_path.stem
    return input_path.stem


def _split_text_units(text: str) -> list[str]:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return []
    chunks = [item.strip() for item in re.split(r"(?<=[。！？.!?])\s+", cleaned) if item.strip()]
    if len(chunks) >= 4:
        return chunks
    return [item.strip() for item in textwrap.wrap(cleaned, width=90) if item.strip()]


def _rule_fallback_slides(input_path: Path, settings: dict[str, Any], text: str) -> list[tuple[str, list[str]]]:
    target = max(4, min(int(settings.get("targetSlides") or 5), 8))
    units = _split_text_units(text)
    title = input_path.stem.replace("_", " ").strip() or "Academic Presentation"
    agenda = ["Research background", "Core problem", "Key evidence", "Summary and next steps"]
    summary = [
        "Model bridge was unavailable.",
        "This basic deck is generated from parsed text.",
        "Please retry for model-enhanced design when the model service is restored.",
    ]

    slides: list[tuple[str, list[str]]] = [
        (title, [units[0][:120] if units else "Generated from parsed source text."]),
        ("Agenda", agenda),
    ]
    content_titles = agenda[: max(target - 3, 1)]
    cursor = 1
    for heading in content_titles:
        bullets = [unit[:140] for unit in units[cursor : cursor + 4]]
        cursor += 4
        if not bullets:
            bullets = ["Content is summarized from the uploaded source."]
        slides.append((heading, bullets))
    slides.append(("Summary", summary))
    return slides[:target]


def _write_rule_fallback_pptx(task_dir: Path, input_path: Path, settings: dict[str, Any], reason: str) -> dict[str, Any]:
    from pptx import Presentation
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    output_path = safe_task_child(task_dir, "outputs", "academic-ppt-result.pptx")
    paper_workspace = safe_task_child(task_dir, "checkpoints", "paper-workspaces", "rule-fallback")
    svg_output = safe_task_child(paper_workspace, "svg_output")
    svg_final = safe_task_child(paper_workspace, "svg_final")
    exports = safe_task_child(paper_workspace, "exports")
    for directory in (svg_output, svg_final, exports):
        directory.mkdir(parents=True, exist_ok=True)

    text = _extract_plain_text_from_input(input_path)
    slides = _rule_fallback_slides(input_path, settings, text)
    presentation = Presentation()
    presentation.slide_width = Inches(13.333)
    presentation.slide_height = Inches(7.5)

    for index, (title, bullets) in enumerate(slides, start=1):
        slide = presentation.slides.add_slide(presentation.slide_layouts[6])
        bg = slide.background.fill
        bg.solid()
        bg.fore_color.rgb = RGBColor(248, 250, 252)
        title_box = slide.shapes.add_textbox(Inches(0.7), Inches(0.55), Inches(11.9), Inches(0.8))
        title_frame = title_box.text_frame
        title_frame.clear()
        title_paragraph = title_frame.paragraphs[0]
        title_paragraph.text = title[:80]
        title_paragraph.font.size = Pt(28)
        title_paragraph.font.bold = True
        title_paragraph.font.color.rgb = RGBColor(15, 23, 42)

        accent = slide.shapes.add_shape(1, Inches(0.7), Inches(1.45), Inches(1.1), Inches(0.08))
        accent.fill.solid()
        accent.fill.fore_color.rgb = RGBColor(37, 99, 235)
        accent.line.fill.background()

        body_box = slide.shapes.add_textbox(Inches(0.85), Inches(1.75), Inches(11.4), Inches(4.7))
        body_frame = body_box.text_frame
        body_frame.word_wrap = True
        body_frame.clear()
        for bullet_index, bullet in enumerate(bullets[:5]):
            paragraph = body_frame.paragraphs[0] if bullet_index == 0 else body_frame.add_paragraph()
            paragraph.text = bullet
            paragraph.level = 0
            paragraph.font.size = Pt(18)
            paragraph.font.color.rgb = RGBColor(51, 65, 85)
            paragraph.space_after = Pt(10)

        footer_box = slide.shapes.add_textbox(Inches(0.7), Inches(6.85), Inches(11.9), Inches(0.25))
        footer = footer_box.text_frame.paragraphs[0]
        footer.text = f"Rule fallback - {index}/{len(slides)}"
        footer.alignment = PP_ALIGN.RIGHT
        footer.font.size = Pt(9)
        footer.font.color.rgb = RGBColor(100, 116, 139)

        svg_stub = f"<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720'><text x='64' y='96'>{title}</text></svg>"
        (svg_output / f"slide_{index:02d}.svg").write_text(svg_stub, encoding="utf-8")
        (svg_final / f"slide_{index:02d}.svg").write_text(svg_stub, encoding="utf-8")

    presentation.save(output_path)
    export_path = exports / "presentation_rule_fallback.pptx"
    shutil.copy2(output_path, export_path)
    design_spec = paper_workspace / "design_spec.md"
    design_spec.write_text(
        "# Rule fallback design spec\n\nModel bridge unavailable; generated a basic structured deck from parsed text.\n",
        encoding="utf-8",
    )
    output_size = output_path.stat().st_size
    write_checkpoint(
        task_dir,
        "pptx-exported",
        {
            "outputFileName": output_path.name,
            "outputFileSize": output_size,
            "slideCount": len(slides),
            "generator": "paper-ppt-agent",
            "generationMode": "paper-ppt-agent-rule-fallback",
            "visualPipelineStatus": "degraded",
            "fallbackReason": reason,
        },
    )
    append_log(task_dir, "warn", "Model enhancement is unavailable; generated a basic PPT from parsed text.")
    return {
        "outputFileName": output_path.name,
        "outputFileSize": output_size,
        "slideCount": len(slides),
        "generationMode": "paper-ppt-agent-rule-fallback",
        "visualPipelineStatus": "degraded",
        "fallbackReason": reason,
        "modelBridgeStatus": "failed",
        "modelBridgePrimaryModel": "subrouter:gpt-5.4",
        "modelBridgePrimaryStatus": "failed",
        "modelBridgeFallbackModel": "moonshot:kimi-k2.5",
        "modelBridgeFallbackStatus": "failed",
        "modelBridgeErrorSummary": reason,
    }

def _is_model_bridge_failure(exc: Exception) -> bool:
    message = sanitize_message(exc).lower()
    return (
        "model bridge" in message
        or "model provider" in message
        or "model unavailable" in message
        or "fallback model unavailable" in message
        or "primary model unavailable" in message
        or "gpt-5.4 visual" in message
        or "strict visual" in message
    )


async def run_paper_ppt_agent_task(
    *,
    task_id: str,
    task_dir: Path,
    input_file_path: Path,
    settings: dict[str, Any],
    request_options: dict[str, Any],
    model_bridge_url: str | None,
    resume: bool,
    resume_from_step: str | None,
    on_progress,
    cancel_event: asyncio.Event,
) -> dict[str, Any]:
    _patch_paper_ppt_agent_runtime(task_dir, model_bridge_url)
    from backend.orchestrator.pipeline import GenerationRequest, run_pipeline

    normalized_input, source_type = _normalize_input_for_paper_agent(input_file_path, task_dir)
    research_context = await _prepare_research_context(
        task_dir=task_dir,
        input_path=input_file_path,
        settings=settings,
        request_options=request_options,
    )
    append_log(task_dir, "info", "Prepared generation input and started the academic PPT engine.")
    write_checkpoint(
        task_dir,
        "generation-state",
        {
            "taskId": task_id,
            "status": "running",
            "sourceType": source_type,
            "resume": resume,
            "resumeFromStep": resume_from_step,
            "deepResearchEnabled": _request_flag(settings, request_options, "deepResearchEnabled", "enableDeepResearch"),
            "externalResearchEnabled": _request_flag(settings, request_options, "externalResearchEnabled", "enableExternalResearch"),
            "webSearchEnabled": bool(request_options.get("webSearchEnabled") or settings.get("webSearchEnabled")),
            "searchProvider": "nexus-searxng",
            "searchStatus": research_context["searchStatus"],
        },
    )

    request = GenerationRequest(
        file_path=normalized_input,
        source_type=source_type,
        provider="nexus",
        model="nexus-primary",
        api_key=task_id,
        base_url=model_bridge_url,
        canvas_format=_canvas_format(settings),
        style=_style(settings),
        num_pages=int(settings.get("targetSlides") or 12),
        instruction="\n\n".join(part for part in [_instruction(settings), research_context["instruction"]] if part),
        language="en" if settings.get("outputLanguage") == "en" else "zh",
        detail_level=_detail_level(settings),
        style_overrides=_visual_quality_style_overrides(settings),
        timeout_seconds=int(get_settings().task_max_runtime_seconds),
        enable_visual_critic=bool(settings.get("enableVisualQa")),
        enable_icon=bool(settings.get("enableIconDecoration")),
        enable_icon_rag=False,
        template_id=_template_id(settings),
    )
    setattr(request, "job_id", task_id)

    output_path: str | None = None
    project_dir: str | None = None
    last_progress = 0

    try:
        async for event in run_pipeline(request):
            if cancel_event.is_set():
                raise asyncio.CancelledError()
            progress = int(max(0, min(100, float(getattr(event, "progress", 0) or 0) * 100)))
            if progress < last_progress:
                progress = last_progress
            last_progress = progress

            stage = str(getattr(event, "stage", "generation"))
            status = str(getattr(event, "status", "progress"))
            message = str(getattr(event, "message", "") or stage)
            data = getattr(event, "data", None) or {}
            if isinstance(data, dict):
                if data.get("project_dir"):
                    project_dir = str(data["project_dir"])
                if data.get("output_path"):
                    output_path = str(data["output_path"])
                if data.get("svg") and data.get("page"):
                    write_checkpoint(
                        task_dir,
                        f"slide-svg-{int(data['page']):03d}",
                        {
                            "page": int(data["page"]),
                            "stage": stage,
                            "status": status,
                            "hasSvg": True,
                        },
                    )

            append_log(task_dir, "error" if status == "error" else "info", _product_log_message(message))
            if project_dir and stage in {"research", "strategy", "generation", "postprocess", "export"}:
                _write_visual_pipeline_checkpoints(task_dir, project_dir, int(settings.get("targetSlides") or 0) or None)
            write_checkpoint(
                task_dir,
                "generation-state",
                {
                    "taskId": task_id,
                    "status": status,
                    "stage": stage,
                    "progress": progress,
                    "message": message,
                    "projectDirKnown": bool(project_dir),
                    "outputKnown": bool(output_path),
                },
            )
            await on_progress(stage, progress, message)
    except Exception as exc:
        if not _is_model_bridge_failure(exc):
            raise
        reason = f"Model bridge unavailable; generated from parsed text with rule fallback. {sanitize_message(exc, 180)}"
        append_log(task_dir, "warn", "Model bridge final failed.")
        append_log(task_dir, "warn", reason)
        if _strict_visual_pipeline_enabled():
            strict_reason = (
                "GPT-5.4 visual generation stage is temporarily unavailable; "
                "strict visual mode did not generate a low-quality fallback deck. "
                "Please retry or resume the task later."
            )
            append_log(task_dir, "error", "Strict visual pipeline is enabled; not generating rule fallback PPTX.")
            write_checkpoint(
                task_dir,
                "generation-state",
                {
                    "taskId": task_id,
                    "status": "failed",
                    "resumable": True,
                    "strictVisualPipeline": True,
                    "fallbackPrevented": True,
                    "fallbackReason": strict_reason,
                    "sourceReason": sanitize_message(exc, 180),
                },
            )
            raise RuntimeError(strict_reason) from exc
        await on_progress("export", 85, "Generating basic PPTX from parsed text.")
        fallback_result = _write_rule_fallback_pptx(task_dir, input_file_path, settings, reason)
        fallback_result.update(
            {
                "searchStatus": research_context["searchStatus"],
                "researchStatus": research_context["researchStatus"],
                "researchSourcesCount": research_context["researchSourcesCount"],
                "researchFallbackReason": research_context["researchFallbackReason"],
            }
        )
        return fallback_result

    output_file, output_size = _safe_output_file(task_dir, output_path)
    slide_count = _extract_slide_count(project_dir)
    target_slide_count = int(settings.get("targetSlides") or request_options.get("slideCount") or 0) or None
    _write_visual_pipeline_checkpoints(task_dir, project_dir, slide_count)
    preview_manifest = _write_svg_preview_manifest(task_dir, task_id, project_dir, slide_count)
    visual_pipeline_status, visual_fallback_reason, basic_fallback_detected = _visual_pipeline_status(
        project_dir,
        output_file,
        target_slide_count,
    )
    fallback_reason = visual_fallback_reason
    generation_mode = "paper-ppt-agent-rule-fallback" if basic_fallback_detected else "paper-ppt-agent"
    model_bridge_snapshot = _read_model_bridge_snapshot(task_dir)
    model_bridge_status = "failed" if basic_fallback_detected else model_bridge_snapshot.get("modelBridgeStatus") or "success"
    model_bridge_primary_status = "failed" if basic_fallback_detected else model_bridge_snapshot.get("modelBridgePrimaryStatus") or "success"
    model_bridge_fallback_status = (
        "failed" if basic_fallback_detected else model_bridge_snapshot.get("modelBridgeFallbackStatus") or "not_started"
    )
    model_bridge_error_summary = fallback_reason if basic_fallback_detected else model_bridge_snapshot.get("modelBridgeErrorSummary")
    if visual_pipeline_status != "success":
        append_log(task_dir, "warn", fallback_reason or "Visual pipeline degraded; quality gates did not pass.")
    write_checkpoint(
        task_dir,
        "pptx-exported",
        {
            "outputFileName": output_file.name,
            "outputFileSize": output_size,
            "slideCount": slide_count,
            "generator": "paper-ppt-agent",
            "generationMode": generation_mode,
            "visualPipelineStatus": visual_pipeline_status,
            "fallbackReason": fallback_reason,
            "modelBridgeStatus": model_bridge_status,
            "modelBridgePrimaryStatus": model_bridge_primary_status,
            "modelBridgeFallbackStatus": model_bridge_fallback_status,
            "modelBridgeErrorSummary": model_bridge_error_summary,
            "searchStatus": research_context["searchStatus"],
            "researchStatus": research_context["researchStatus"],
            "researchSourcesCount": research_context["researchSourcesCount"],
            "previewType": preview_manifest.get("type") if preview_manifest else None,
            "previewSlideCount": preview_manifest.get("slideCount") if preview_manifest else None,
        },
    )
    append_log(task_dir, "info", f"PPTX generated. Size: {round(output_size / 1024)} KB.")
    return {
        "outputFileName": output_file.name,
        "outputFileSize": output_size,
        "slideCount": slide_count,
        "generationMode": generation_mode,
        "visualPipelineStatus": visual_pipeline_status,
        "fallbackReason": fallback_reason,
        "modelBridgeStatus": model_bridge_status,
        "modelBridgePrimaryModel": model_bridge_snapshot.get("modelBridgePrimaryModel") or "subrouter:gpt-5.4",
        "modelBridgePrimaryStatus": model_bridge_primary_status,
        "modelBridgeFallbackModel": model_bridge_snapshot.get("modelBridgeFallbackModel") or "moonshot:kimi-k2.5",
        "modelBridgeFallbackStatus": model_bridge_fallback_status,
        "modelBridgeErrorSummary": model_bridge_error_summary,
        "searchStatus": research_context["searchStatus"],
        "researchStatus": research_context["researchStatus"],
        "researchSourcesCount": research_context["researchSourcesCount"],
        "researchFallbackReason": research_context["researchFallbackReason"],
        "previewAvailable": bool(preview_manifest and preview_manifest.get("available")),
        "previewType": preview_manifest.get("type") if preview_manifest else None,
        "previewSlideCount": preview_manifest.get("slideCount") if preview_manifest else None,
        "previewManifestPath": str(safe_task_child(task_dir, "previews", "manifest.json")) if preview_manifest else None,
        "previewFallbackReason": None if preview_manifest else "Real SVG preview is not available yet.",
        "previewUpdatedAt": preview_manifest.get("generatedAt") if preview_manifest else None,
    }
