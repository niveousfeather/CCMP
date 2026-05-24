import JSZip from "jszip";

export async function parsePptxDocument(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => getSlideNumber(left) - getSlideNumber(right));

  const slides: string[] = [];
  for (const fileName of slideFiles) {
    const xml = await zip.files[fileName].async("string");
    const textItems = extractSlideText(xml);
    if (textItems.length) {
      slides.push([`幻灯片 ${getSlideNumber(fileName)}`, ...textItems].join("\n"));
    }
  }

  return {
    parser: "pptx" as const,
    text: slides.join("\n\n"),
    slideCount: slideFiles.length,
    warnings: []
  };
}

function getSlideNumber(fileName: string) {
  return Number(fileName.match(/slide(\d+)\.xml$/i)?.[1] || 0);
}

function extractSlideText(xml: string) {
  const matches = Array.from(xml.matchAll(/<(?:a|m):t(?:\s[^>]*)?>([\s\S]*?)<\/(?:a|m):t>/gi));
  return matches
    .map((match) => decodeXmlText(match[1]))
    .map((text) => text.trim())
    .filter(Boolean);
}

function decodeXmlText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
