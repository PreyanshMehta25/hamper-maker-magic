import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { CatalogForm, CatalogPageData } from "@/components/CatalogForm";
import { CatalogPreview } from "@/components/CatalogPreview";
import { MultiPagePreview } from "@/components/MultiPagePreview";
import { Button } from "@/components/ui/button";
import { Download, Eye, Sparkles, ChevronLeft, ChevronRight, FileText, Presentation, Receipt, Gift } from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import PptxGenJS from "pptxgenjs";
import { toast } from "sonner";

const createEmptyPage = (): CatalogPageData => ({
  id: crypto.randomUUID(),
  type: "template",
  image: null,
  title: "",
  description: "",
  items: [""],
  plasticPercent: "",
  carbonPercent: "",
});

// ─── Slide dimensions (inches) ───────────────────────────────────────────────
// Standard widescreen 10 × 5.625 — matches most "intro slide" decks
const SLIDE_W = 10;
const SLIDE_H = 5.625;

// Layout constants (inches)
const IMG_W = SLIDE_W * 0.62;       // 62% width for image
const RIGHT_W = SLIDE_W - IMG_W;    // remaining right panel
const CARD_LEFT = IMG_W - 0.3;      // white card overlaps image slightly
const CARD_TOP = 0.35;
const CARD_BOT = 0.35;
const CARD_H = SLIDE_H - CARD_TOP - CARD_BOT;
const CARD_W = SLIDE_W - CARD_LEFT - 0.2;
const PAD_X = 0.28;                 // horizontal padding inside card
const PAD_Y = 0.28;

// Brand colours
const BEIGE_BG  = "EDE2D6";
const BROWN     = "7A6451";
const WHITE     = "FFFFFF";
const GREEN     = "2D6A4F";

/**
 * Converts a base-64 data-URL (or plain base-64 string) to the format
 * PptxGenJS expects: { data: "base64,<data>" }
 */
function toB64(src: string): string {
  // Already a data-URL like "data:image/png;base64,..."
  if (src.startsWith("data:")) return src;
  // Raw base-64 — wrap it
  return `data:image/png;base64,${src}`;
}

async function imageToDataUrl(src: string): Promise<string> {
  if (src.startsWith("data:")) return src;

  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(
      `Failed to load image: ${response.status} ${response.statusText}`,
    );
  }

  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Failed to convert image to data URL"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image data"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Build one "template" slide (image left + white card right).
 */
function buildTemplateSlide(pptx: PptxGenJS, page: CatalogPageData) {
  const slide = pptx.addSlide();

  // ── Background (beige) ──────────────────────────────────────────────────
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: BEIGE_BG },
    line: { color: BEIGE_BG },
  });

  // ── Product image (left 62%) ────────────────────────────────────────────
  if (page.image) {
    slide.addImage({
      data: toB64(page.image),
      x: 0, y: 0, w: IMG_W, h: SLIDE_H,
      sizing: { type: "cover", w: IMG_W, h: SLIDE_H },
    });
  }

  // ── White card (overlapping) ────────────────────────────────────────────
  slide.addShape(pptx.ShapeType.rect, {
    x: CARD_LEFT, y: CARD_TOP, w: CARD_W, h: CARD_H,
    fill: { color: WHITE },
    line: { color: WHITE },
    shadow: { type: "outer", blur: 8, offset: 4, angle: 45, color: "000000", opacity: 0.08 },
  });

  let cursorY = CARD_TOP + PAD_Y;
  const textX = CARD_LEFT + PAD_X;
  const textW = CARD_W - PAD_X * 2;

  // ── Title ───────────────────────────────────────────────────────────────
  const titleText = page.title || "Hamper Title";
  slide.addText(titleText, {
    x: textX, y: cursorY, w: textW, h: 0.55,
    fontSize: 14,
    bold: true,
    color: BROWN,
    fontFace: "Asap",
    wrap: true,
    autoFit: true,
  });
  cursorY += 0.62;

  // ── Description bullet points ───────────────────────────────────────────
  const descLines = page.description
    ? page.description.split("\n").map((l) => l.trim()).filter(Boolean)
    : [];

  const bulletH = CARD_H - PAD_Y * 2 - 0.62 /* title */ - 1.1 /* footer */;

  if (descLines.length > 0) {
    const bulletRows = descLines.map((line) => ({
      text: line,
      options: {
        bullet: { code: "2022" },   // • character
        fontSize: 7.5,
        color: BROWN,
        fontFace: "Asap",
        paraSpaceAfter: 3,
      },
    }));

    slide.addText(bulletRows, {
      x: textX, y: cursorY, w: textW, h: bulletH,
      valign: "top",
      wrap: true,
    });
  }

  // ── Footer (eco stats + pricing) ────────────────────────────────────────
  const footerY = CARD_TOP + CARD_H - PAD_Y - 0.75;

  // Divider line
  slide.addShape(pptx.ShapeType.line, {
    x: textX, y: footerY - 0.08, w: textW, h: 0,
    line: { color: "E5E7EB", width: 0.5 },
  });

  // Eco text
  const plastic = page.plasticPercent || "80";
  const carbon  = page.carbonPercent  || "71";
  slide.addText(
    `${plastic}% less plastic pollution  |  ${carbon}% less carbon emissions`,
    {
      x: textX, y: footerY, w: textW, h: 0.22,
      fontSize: 6.5,
      italic: true,
      color: GREEN,
      fontFace: "Asap",
    }
  );

  // Pricing
  if (page.preTaxPrice && page.preTaxPrice > 0) {
    const salePrice     = page.preTaxPrice;
    const originalPrice = Math.round(salePrice * 1.33);
    const fmtIN = (n: number) =>
      `\u20B9${n.toLocaleString("en-IN")}`; // ₹

    const pricingY = footerY + 0.25;

    // MRP (strikethrough)
    slide.addText([
      { text: "MRP ", options: { fontSize: 7, color: BROWN, fontFace: "Asap" } },
      { text: fmtIN(originalPrice), options: { fontSize: 7, color: BROWN, fontFace: "Asap", strike: true } },
      { text: `  ${fmtIN(salePrice)}`, options: { fontSize: 7, bold: true, color: BROWN, fontFace: "Asap" } },
      { text: "  Bulk pricing | Tax & shipping extra", options: { fontSize: 6.5, color: BROWN, fontFace: "Asap" } },
    ], {
      x: textX, y: pricingY, w: textW, h: 0.28,
      wrap: true,
    });
  } else {
    slide.addText("₹— | Bulk pricing | Tax & shipping extra", {
      x: textX, y: footerY + 0.25, w: textW, h: 0.25,
      fontSize: 7,
      color: BROWN,
      fontFace: "Asap",
    });
  }
}

/**
 * Build one "full-image" slide.
 */
function buildFullImageSlide(pptx: PptxGenJS, page: CatalogPageData) {
  const slide = pptx.addSlide();

  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
    fill: { color: BEIGE_BG },
    line: { color: BEIGE_BG },
  });

  if (page.image) {
    slide.addImage({
      data: toB64(page.image),
      x: 0, y: 0, w: SLIDE_W, h: SLIDE_H,
      sizing: { type: "cover", w: SLIDE_W, h: SLIDE_H },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const Index = () => {
  const multiPageRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  
  const [pages, setPages] = useState<CatalogPageData[]>([createEmptyPage()]);

  const activePage = pages[activePageIndex];

  // ── PDF (unchanged — still uses html2canvas) ──────────────────────────────
  const handleDownloadPDF = async () => {
    if (!multiPageRef.current) return;

    const invalidPages = pages.filter((p) => !p.image);
    if (invalidPages.length > 0) {
      toast.error(`Please add an image to all ${pages.length} pages`);
      return;
    }

    setIsGenerating(true);

    try {
      const nodes = Array.from(
        multiPageRef.current.querySelectorAll<HTMLElement>(".pdf-page")
      );

      const pdf = new jsPDF({
        unit: "px",
        format: [1200, 630],
        orientation: "landscape",
      });

      for (let i = 0; i < nodes.length; i++) {
        const canvas = await html2canvas(nodes[i], {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
          width: 1200,
          height: 630,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.98);

        if (i > 0) pdf.addPage([1200, 630], "landscape");
        pdf.addImage(imgData, "JPEG", 0, 0, 1200, 630);
      }

      pdf.save(`catalog_${pages.length}_pages.pdf`);
      toast.success(`PDF with ${pages.length} page(s) downloaded!`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast.error("Failed to generate PDF. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  // ── PPT (fully programmatic — editable text, native images) ──────────────
  const handleDownloadPPT = async () => {
    const invalidPages = pages.filter((p) => !p.image);
    if (invalidPages.length > 0) {
      toast.error(`Please add an image to all ${pages.length} pages`);
      return;
    }

    setIsGenerating(true);

    try {
      const pptx = new PptxGenJS();
      const pagesWithEmbeddedImages = await Promise.all(
        pages.map(async (page) => {
          if (!page.image) return page;

          try {
            return { ...page, image: await imageToDataUrl(page.image) };
          } catch (error) {
            console.error("Failed to embed image for PPT:", page.id, error);
            throw new Error(
              "Failed to load an image for PowerPoint export. Please re-upload the hamper image and try again.",
            );
          }
        }),
      );

      // Standard widescreen layout (same ratio as Google Slides default)
      pptx.defineLayout({ name: "CATALOG", width: SLIDE_W, height: SLIDE_H });
      pptx.layout = "CATALOG";

      for (const page of pagesWithEmbeddedImages) {
        if (page.type === "full-image") {
          buildFullImageSlide(pptx, page);
        } else {
          buildTemplateSlide(pptx, page);
        }
      }

      await pptx.writeFile({ fileName: `catalog_${pages.length}_slides.pptx` });
      toast.success(`PowerPoint with ${pages.length} editable slide(s) downloaded!`);
    } catch (error) {
      console.error("Error generating PPT:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to generate PowerPoint. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const goToPrevPage = () => {
    if (activePageIndex > 0) setActivePageIndex(activePageIndex - 1);
  };

  const goToNextPage = () => {
    if (activePageIndex < pages.length - 1) setActivePageIndex(activePageIndex + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card shadow-sm sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">∞</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary">Catalog Generator</h1>
              <p className="text-xs text-muted-foreground">Create multi-page PDF catalogs</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Link to="/invoice">
              <Button variant="outline" className="gap-2">
                <Receipt className="h-4 w-4" />
                Invoice
              </Button>
            </Link>
            <Link to="/staff/hamper-designer">
              <Button variant="outline" className="gap-2">
                <Gift className="h-4 w-4" />
                Hamper Designer
              </Button>
            </Link>
            <Button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              variant="outline"
              className="gap-2"
            >
              {isGenerating ? (
                <Sparkles className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              onClick={handleDownloadPPT}
              disabled={isGenerating}
              className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-md"
            >
              {isGenerating ? (
                <Sparkles className="h-4 w-4 animate-spin" />
              ) : (
                <Presentation className="h-4 w-4" />
              )}
              PPT ({pages.length})
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1800px] mx-auto px-6 py-8">
        <div className="grid lg:grid-cols-[380px,1fr] gap-8">
          {/* Form Section */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <CatalogForm 
              pages={pages} 
              activePageIndex={activePageIndex}
              onPagesChange={setPages} 
              onActivePageChange={setActivePageIndex}
            />
          </aside>

          {/* Preview Section */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Eye className="h-4 w-4" />
                <span>Live Preview</span>
              </div>
              
              {/* Page Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToPrevPage}
                  disabled={activePageIndex === 0}
                  className="h-8 px-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[80px] text-center">
                  Page {activePageIndex + 1} of {pages.length}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={goToNextPage}
                  disabled={activePageIndex === pages.length - 1}
                  className="h-8 px-2"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Single Page Preview */}
            <div className="catalog-preview rounded-xl overflow-hidden border border-border/50">
              <div className="overflow-x-auto">
                <CatalogPreview page={activePage} />
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground text-center">
              Previewing page {activePageIndex + 1}. All {pages.length} pages will be included in PDF/PPT.
            </p>

            {/* Page Thumbnails */}
            {pages.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {pages.map((page, index) => (
                  <button
                    key={page.id}
                    onClick={() => setActivePageIndex(index)}
                    className={`relative shrink-0 w-24 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                      index === activePageIndex 
                        ? 'border-primary ring-2 ring-primary/20' 
                        : 'border-border/50 hover:border-primary/30'
                    }`}
                  >
                    {page.image ? (
                      <img src={page.image} alt={`Page ${index + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${
                        page.type === "full-image" ? "bg-accent/20" : "bg-secondary/50"
                      }`}>
                        <span className="text-xs text-muted-foreground">
                          {page.type === "full-image" ? "🖼️" : index + 1}
                        </span>
                      </div>
                    )}
                    <div className={`absolute bottom-0 left-0 right-0 text-primary-foreground text-[10px] text-center py-0.5 ${
                      page.type === "full-image" ? "bg-accent/80" : "bg-foreground/70"
                    }`}>
                      {page.type === "full-image" 
                        ? "Full Image" 
                        : (page.title ? page.title.slice(0, 10) + (page.title.length > 10 ? '...' : '') : `Page ${index + 1}`)}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Hidden multi-page container for PDF generation */}
      <div className="fixed left-0 top-0 opacity-0 pointer-events-none -z-10">
        <MultiPagePreview ref={multiPageRef} pages={pages} />
      </div>

      <footer className="border-t border-border/50 mt-12 py-6">
        <div className="max-w-[1800px] mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>Corporate Gifting Catalog Generator • Made with care for your sales team</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
