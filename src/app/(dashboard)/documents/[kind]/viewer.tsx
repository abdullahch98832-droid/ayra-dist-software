"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ArrowLeft, Download, ExternalLink, FileX2, LoaderCircle, Printer, RotateCcw, ShieldAlert, TriangleAlert, ZoomIn, ZoomOut } from "lucide-react";
import { useI18n } from "@/i18n/context";
import { fill } from "@/i18n/format";
import { cn } from "@/lib/utils";
import { DOC_LANGUAGES, type DocLanguage } from "@/lib/pdf/model";
import { LOCALES } from "@/types";
import { StateMessage } from "@/components/shared/states";
import { Button, buttonVariants } from "@/components/ui/button";

type Failure = "notFound" | "forbidden" | "mismatch" | "outdated" | "failed";
interface Loaded { url: string; pdf: PDFDocumentProxy | null; blob: string; failure: Failure | null }

const ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 2] as const;

/** The reader of the preview, loaded only on this page. */
async function readPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return (await pdfjs.getDocument({ data }).promise) as unknown as PDFDocumentProxy;
}

/** Preview, download, print and language of one document. Every button works on the same PDF. */
export function DocumentViewer({ url, language }: { url: string; language: DocLanguage }) {
  const { t } = useI18n();
  const d = t.docs;
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [, startTransition] = useTransition();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState<number>(2);
  const current = loaded?.url === url ? loaded : null;

  useEffect(() => {
    let live = true;
    let blob = "";
    const load = async () => {
      let failure: Failure | null = null;
      let pdf: PDFDocumentProxy | null = null;
      try {
        const response = await fetch(url, { headers: { Accept: "application/pdf" } });
        if (response.ok && response.headers.get("Content-Type")?.startsWith("application/pdf")) {
          const data = await response.arrayBuffer();
          blob = URL.createObjectURL(new Blob([data], { type: "application/pdf" }));
          // Without a preview the file can still be opened, downloaded and printed.
          pdf = await readPdf(data.slice(0)).catch((error: unknown) => { console.error("Preview:", error); return null; });
        } else {
          const body = (await response.json().catch(() => ({}))) as { code?: Failure };
          failure = body.code ?? "failed";
        }
      } catch {
        failure = "failed";
      }
      if (live) setLoaded({ url, pdf, blob, failure });
      else if (blob) URL.revokeObjectURL(blob);
    };
    void load();
    return () => {
      live = false;
      if (blob) URL.revokeObjectURL(blob);
    };
  }, [url, attempt]);

  const choose = (next: DocLanguage) => {
    const params = new URLSearchParams(search);
    params.set("lang", next);
    startTransition(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  };

  const print = () => {
    if (!current?.blob) return;
    // Browsers without a built-in reader (most phones) print from the opened file.
    if (!navigator.pdfViewerEnabled) {
      window.open(url, "_blank", "noopener");
      return;
    }
    const frame = document.createElement("iframe");
    frame.className = "fixed size-0 border-0 opacity-0";
    frame.title = d.print;
    frame.src = current.blob;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    };
    document.querySelectorAll("iframe[data-print]").forEach((old) => old.remove());
    frame.dataset.print = "";
    document.body.append(frame);
  };

  const ready = !!current && !current.failure;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="rtl:-scale-x-100" aria-hidden />{t.common.back}</Button>
          <div role="radiogroup" aria-label={d.language} className="flex rounded-xl border bg-background p-1">
            {DOC_LANGUAGES.map((code) => (
              <button
                key={code} type="button" role="radio" aria-checked={code === language} lang={code === "ur" ? "ur" : undefined} onClick={() => choose(code)}
                className={cn("rounded-lg px-3 py-1 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/40", code === language ? "bg-gradient-action font-medium text-primary-foreground shadow-action" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}
              >
                {code === "both" ? d.bothLanguages : LOCALES[code].nativeLabel}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {current?.pdf && (
            <div className="hidden items-center gap-1 sm:flex">
              <span className="px-2 text-sm text-muted-foreground">{fill(d.pages, { count: current.pdf.numPages })}</span>
              <Button variant="ghost" size="icon" aria-label={d.zoomOut} disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)}><ZoomOut aria-hidden /></Button>
              <Button variant="ghost" size="icon" aria-label={d.zoomIn} disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => z + 1)}><ZoomIn aria-hidden /></Button>
            </div>
          )}
          <Button variant="outline" disabled={!ready} onClick={print}><Printer aria-hidden />{d.print}</Button>
          {ready
            ? <a href={`${url}&download=1`} download className={buttonVariants({})}><Download aria-hidden />{d.download}</a>
            : <Button disabled><Download aria-hidden />{d.download}</Button>}
        </div>
      </div>

      {!current ? (
        <div className="flex min-h-96 items-center justify-center rounded-2xl border bg-card shadow-card" aria-busy="true" role="status">
          <span className="flex items-center gap-3 text-sm text-muted-foreground"><LoaderCircle className="size-5 animate-spin" aria-hidden />{d.loading}</span>
        </div>
      ) : current.failure ? (
        <Failed failure={current.failure} retry={() => { setLoaded(null); setAttempt((n) => n + 1); }} />
      ) : current.pdf ? (
        <Pages pdf={current.pdf} zoom={ZOOMS[zoom] ?? 1} label={d.preview} />
      ) : (
        <div className="rounded-2xl border bg-card shadow-card">
          <StateMessage icon={TriangleAlert} tone="warning" title={d.failed} description={d.failedHint}
            actions={<a href={url} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}><ExternalLink aria-hidden />{d.open}</a>} />
        </div>
      )}
    </div>
  );
}

function Failed({ failure, retry }: { failure: Failure; retry: () => void }) {
  const { t } = useI18n();
  const again = <Button variant="outline" onClick={retry}><RotateCcw aria-hidden />{t.common.retry}</Button>;
  const view = {
    notFound: { icon: FileX2, tone: "neutral", title: t.states.notFoundTitle, description: t.states.notFoundHint, actions: undefined },
    forbidden: { icon: ShieldAlert, tone: "warning", title: t.states.forbiddenTitle, description: t.states.forbiddenHint, actions: undefined },
    mismatch: { icon: TriangleAlert, tone: "danger", title: t.docs.mismatch, description: t.docs.mismatchHint, actions: undefined },
    outdated: { icon: TriangleAlert, tone: "warning", title: t.dashboard.section.outdated, description: t.dashboard.section.outdatedHint, actions: again },
    failed: { icon: TriangleAlert, tone: "danger", title: t.docs.failed, description: t.docs.failedHint, actions: again },
  } as const;
  const v = view[failure] ?? view.failed;
  return <div role="alert" className="rounded-2xl border bg-card shadow-card"><StateMessage icon={v.icon} tone={v.tone} title={v.title} description={v.description} actions={v.actions} /></div>;
}

function Pages({ pdf, zoom, label }: { pdf: PDFDocumentProxy; zoom: number; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry?.contentRect.width ?? 0)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div role="region" aria-label={label} tabIndex={0} dir="ltr" className="max-h-[calc(100dvh-9rem)] min-h-96 overflow-auto rounded-2xl border bg-muted-strong/60 p-3 shadow-inner outline-none focus-visible:ring-3 focus-visible:ring-ring/40 sm:p-6">
      <div ref={box} className="grid justify-items-center gap-4">
        {width > 0 && Array.from({ length: pdf.numPages }, (_, i) => <PageCanvas key={i} pdf={pdf} index={i + 1} width={Math.min(width, 900) * zoom} />)}
      </div>
    </div>
  );
}

/** One page, drawn when it comes near the screen. */
function PageCanvas({ pdf, index, width }: { pdf: PDFDocumentProxy; index: number; width: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(1.414);
  const draw = useCallback(async () => {
    const page = await pdf.getPage(index);
    const base = page.getViewport({ scale: 1 });
    setRatio(base.height / base.width);
    const target = canvas.current;
    if (!target) return;
    const viewport = page.getViewport({ scale: (width / base.width) * Math.min(window.devicePixelRatio || 1, 2) });
    target.width = Math.round(viewport.width);
    target.height = Math.round(viewport.height);
    await page.render({ canvas: target, viewport }).promise;
  }, [pdf, index, width]);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      draw().catch((error: unknown) => console.error("Preview page:", error));
    }, { rootMargin: "600px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [draw]);
  return <canvas ref={canvas} data-page={index} style={{ width, height: Math.round(width * ratio) }} className="rounded-sm bg-white shadow-raised" />;
}
