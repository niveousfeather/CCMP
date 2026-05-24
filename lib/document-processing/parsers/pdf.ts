const runtimeRequire = eval("require") as NodeRequire;

type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
};

type PdfTextContent = {
  items: PdfTextItem[];
};

type PdfPage = {
  getTextContent: () => Promise<PdfTextContent>;
  cleanup?: () => void;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy?: () => Promise<void>;
};

type PdfJs = {
  getDocument: (options: {
    data: Uint8Array;
    disableWorker?: boolean;
    useSystemFonts?: boolean;
  }) => {
    promise: Promise<PdfDocument>;
  };
};

export async function parsePdfDocument(buffer: Buffer) {
  const pdfjs = runtimeRequire("pdfjs-dist/legacy/build/pdf.js") as PdfJs;
  const data = new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  const loadingTask = pdfjs.getDocument({
    data,
    disableWorker: true,
    useSystemFonts: true
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push(joinTextItems(textContent.items));
      page.cleanup?.();
    }
  } finally {
    await document.destroy?.();
  }

  return {
    parser: "pdf" as const,
    text: pages.join("\n\n"),
    pageCount: document.numPages,
    warnings: []
  };
}

function joinTextItems(items: PdfTextItem[]) {
  return items
    .map((item) => {
      const text = item.str || "";
      return item.hasEOL ? `${text}\n` : text;
    })
    .join(" ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
