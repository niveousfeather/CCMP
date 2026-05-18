import type { PresentationDesignSpec, PresentationStyle } from "@/lib/presentation/types";
import { PRESENTATION_V2_DESIGN_SPECS } from "@/lib/presentation/v2/presets";

export type PresentationThemeV2 = PresentationDesignSpec & {
  name: string;
  fonts: {
    heading: string;
    body: string;
  };
  slideCssClass: string;
  visualTreatment: "paper" | "teaching-card" | "consulting-panel" | "clean-panel";
};

export type PresentationVisualThemeName = "academic_paper" | "teaching_clean" | "business_report";

export type PresentationVisualTheme = {
  name: PresentationVisualThemeName;
  slide: {
    width: number;
    height: number;
    marginX: number;
    marginY: number;
  };
  typography: {
    titleFontSize: number;
    subtitleFontSize: number;
    sectionFontSize: number;
    bodyFontSize: number;
    captionFontSize: number;
    noteFontSize: number;
    fontFace: string;
  };
  colors: {
    background: string;
    surface: string;
    surfaceAlt: string;
    primary: string;
    secondary: string;
    accent: string;
    text: string;
    mutedText: string;
    border: string;
    danger: string;
    success: string;
    warning: string;
  };
  radius: {
    card: number;
    image: number;
    pill: number;
  };
  shadow: {
    card: boolean;
    image: boolean;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
};

const THEME_NAMES: Record<PresentationStyle, string> = {
  academic: "Academic Research",
  teaching: "Teaching Courseware",
  business: "Business Modern",
  general: "General Clean"
};

const TREATMENTS: Record<PresentationDesignSpec["motif"], PresentationThemeV2["visualTreatment"]> = {
  paper: "paper",
  classroom: "teaching-card",
  consulting: "consulting-panel",
  clean: "clean-panel"
};

export function getPresentationThemeV2(style: PresentationStyle = "general"): PresentationThemeV2 {
  const spec = PRESENTATION_V2_DESIGN_SPECS[style] || PRESENTATION_V2_DESIGN_SPECS.general;

  return {
    ...spec,
    name: THEME_NAMES[style] || THEME_NAMES.general,
    fonts: {
      heading: spec.headingFont,
      body: spec.bodyFont
    },
    slideCssClass: `theme-${spec.themeId}`,
    visualTreatment: TREATMENTS[spec.motif]
  };
}

export function getPresentationThemeCss(theme: PresentationThemeV2) {
  return [
    `--ppt-bg:#${theme.background}`,
    `--ppt-surface:#${theme.surface}`,
    `--ppt-primary:#${theme.primary}`,
    `--ppt-accent:#${theme.accent}`,
    `--ppt-body:#${theme.body}`,
    `--ppt-muted:#${theme.muted}`,
    `--ppt-heading-font:${theme.fonts.heading}`,
    `--ppt-body-font:${theme.fonts.body}`
  ].join(";");
}

export const PRESENTATION_VISUAL_THEMES: Record<PresentationVisualThemeName, PresentationVisualTheme> = {
  academic_paper: {
    name: "academic_paper",
    slide: {
      width: 12192000,
      height: 6858000,
      marginX: 500000,
      marginY: 380000
    },
    typography: {
      titleFontSize: 3150,
      subtitleFontSize: 1350,
      sectionFontSize: 1700,
      bodyFontSize: 1180,
      captionFontSize: 820,
      noteFontSize: 760,
      fontFace: "Aptos"
    },
    colors: {
      background: "FAFAF7",
      surface: "FFFFFF",
      surfaceAlt: "EEF3F8",
      primary: "182A56",
      secondary: "3D6FA3",
      accent: "D65A31",
      text: "1F2937",
      mutedText: "6B7280",
      border: "D7DEE8",
      danger: "B91C1C",
      success: "198754",
      warning: "B7791F"
    },
    radius: {
      card: 8,
      image: 6,
      pill: 999
    },
    shadow: {
      card: true,
      image: true
    },
    spacing: {
      xs: 90000,
      sm: 160000,
      md: 260000,
      lg: 380000,
      xl: 560000
    }
  },
  teaching_clean: {
    name: "teaching_clean",
    slide: {
      width: 12192000,
      height: 6858000,
      marginX: 620000,
      marginY: 460000
    },
    typography: {
      titleFontSize: 3100,
      subtitleFontSize: 1320,
      sectionFontSize: 1640,
      bodyFontSize: 1120,
      captionFontSize: 760,
      noteFontSize: 760,
      fontFace: "Microsoft YaHei"
    },
    colors: {
      background: "F7FBFF",
      surface: "FFFFFF",
      surfaceAlt: "EAF4FF",
      primary: "2563EB",
      secondary: "7DD3FC",
      accent: "10B981",
      text: "123047",
      mutedText: "64748B",
      border: "CFE2FF",
      danger: "DC2626",
      success: "059669",
      warning: "D97706"
    },
    radius: {
      card: 10,
      image: 8,
      pill: 999
    },
    shadow: {
      card: true,
      image: true
    },
    spacing: {
      xs: 90000,
      sm: 170000,
      md: 280000,
      lg: 400000,
      xl: 580000
    }
  },
  business_report: {
    name: "business_report",
    slide: {
      width: 12192000,
      height: 6858000,
      marginX: 620000,
      marginY: 450000
    },
    typography: {
      titleFontSize: 3050,
      subtitleFontSize: 1300,
      sectionFontSize: 1600,
      bodyFontSize: 1080,
      captionFontSize: 740,
      noteFontSize: 740,
      fontFace: "Aptos"
    },
    colors: {
      background: "F8FAFC",
      surface: "FFFFFF",
      surfaceAlt: "EEF2FF",
      primary: "312E81",
      secondary: "0891B2",
      accent: "F97316",
      text: "111827",
      mutedText: "6B7280",
      border: "D8DEE9",
      danger: "B91C1C",
      success: "047857",
      warning: "B45309"
    },
    radius: {
      card: 8,
      image: 6,
      pill: 999
    },
    shadow: {
      card: true,
      image: true
    },
    spacing: {
      xs: 90000,
      sm: 160000,
      md: 260000,
      lg: 380000,
      xl: 560000
    }
  }
};

export function getPresentationVisualTheme(name: PresentationVisualThemeName = "academic_paper"): PresentationVisualTheme {
  return PRESENTATION_VISUAL_THEMES[name] || PRESENTATION_VISUAL_THEMES.academic_paper;
}
