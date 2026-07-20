import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Upload, FileText, CheckCircle } from "lucide-react";
import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";

type UploadPageProps = { onNavigate?: (page: string, state?: any) => void };
type MetaPair = { key: string; value: string };

type UploadPayload = {
  kabupaten: string; puskesmas: string; bulanTahun: string; metaPairs: MetaPair[];
  rows: any[]; headerKeys: string[]; headerLabels: string[]; headerOrder: string[];
  fileName?: string; sourceSheetName?: string;
  headerBlock?: { start: number; end: number; rows: any[][]; merges: any[] };
};

type WorksheetData = UploadPayload & { worksheetName: string };
type MultiWorksheetPayload = { fileName?: string; worksheets: WorksheetData[]; activeWorksheetIndex?: number };

const btnAnim = "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]";
const PENDING_WORKSHEETS_KEY = "uploadPendingWorksheets";
const SELECTED_WORKSHEET_INDEX_KEY = "uploadSelectedWorksheetIndex";

export function UploadPage({ onNavigate }: UploadPageProps) {
  const [uploadStep, setUploadStepState] = useState<number>(1);
  const [dragActive, setDragActive] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pendingWorksheets, setPendingWorksheets] = useState<WorksheetData[]>([]);
  const [selectedWorksheetIndex, setSelectedWorksheetIndex] = useState<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const setUploadStep = (s: number) => {
    setUploadStepState(s);
    try { sessionStorage.setItem("uploadStep", String(s)); } catch {}
  };

  const clearWorksheetSelectionState = () => {
    setPendingWorksheets([]);
    setSelectedWorksheetIndex(null);
    try {
      sessionStorage.removeItem(PENDING_WORKSHEETS_KEY);
      sessionStorage.removeItem(SELECTED_WORKSHEET_INDEX_KEY);
    } catch {}
  };

  useEffect(() => {
    try {
      const ps = sessionStorage.getItem("uploadStep"); if (ps) setUploadStepState(Number(ps));
      const pn = sessionStorage.getItem("uploadFileName"); if (pn) setFileName(pn);
      const pending = sessionStorage.getItem(PENDING_WORKSHEETS_KEY);
      if (pending) {
        const parsed = JSON.parse(pending);
        if (Array.isArray(parsed)) setPendingWorksheets(parsed);
      }
      const selected = sessionStorage.getItem(SELECTED_WORKSHEET_INDEX_KEY);
      if (selected !== null) setSelectedWorksheetIndex(Number(selected));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (pendingWorksheets.length > 0) {
        sessionStorage.setItem(PENDING_WORKSHEETS_KEY, JSON.stringify(pendingWorksheets));
      } else {
        sessionStorage.removeItem(PENDING_WORKSHEETS_KEY);
      }
    } catch {}
  }, [pendingWorksheets]);

  useEffect(() => {
    try {
      if (selectedWorksheetIndex !== null) {
        sessionStorage.setItem(SELECTED_WORKSHEET_INDEX_KEY, String(selectedWorksheetIndex));
      } else {
        sessionStorage.removeItem(SELECTED_WORKSHEET_INDEX_KEY);
      }
    } catch {}
  }, [selectedWorksheetIndex]);

  useEffect(() => {
    const handler = () => {
      setUploadStep(1);
      setFileName(null);
      setFileError(null);
      clearWorksheetSelectionState();
      try {
        sessionStorage.removeItem("previewData");
        sessionStorage.removeItem("uploadFileName");
        sessionStorage.removeItem("uploadStep");
      } catch {}
    };
    window.addEventListener("upload-reset", handler);
    return () => window.removeEventListener("upload-reset", handler);
  }, []);

  const proceedToPreview = (dataToSave: UploadPayload) => {
    clearWorksheetSelectionState();
    setUploadStep(2);
    try { sessionStorage.setItem("previewData", JSON.stringify(dataToSave)); } catch {}
    setTimeout(() => {
      setUploadStep(3);
      onNavigate?.("preview", { data: dataToSave });
      try { window.dispatchEvent(new CustomEvent("preview-ready")); } catch {}
    }, 700);
  };

  const steps = [
    { number: 1, title: "Pilih File Data", description: "Unggah file Excel atau CSV berisi data kesehatan lansia", status: uploadStep > 1 ? "completed" : uploadStep === 1 ? "active" : "pending" },
    { number: 2, title: "Validasi Data", description: "Sistem akan memeriksa format dan kelengkapan data", status: uploadStep > 2 ? "completed" : uploadStep === 2 ? "active" : "pending" },
    { number: 3, title: "Konfirmasi Import", description: "Review data sebelum disimpan ke sistem", status: uploadStep > 3 ? "completed" : uploadStep === 3 ? "active" : "pending" },
  ];

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  function detectHeaderRow(arr: any[][], maxScanRows = 12, minNonEmptyCells = 3) {
    const rowsToCheck = Math.min(maxScanRows, arr.length);
    let bestIdx = 0, bestCount = -1;
    for (let i = 0; i < rowsToCheck; i++) {
      const nonEmpty = (arr[i] || []).reduce((acc: number, c: any) => acc + (c !== null && c !== undefined && String(c).trim() !== "" ? 1 : 0), 0);
      if (nonEmpty > bestCount) { bestCount = nonEmpty; bestIdx = i; }
    }
    return bestCount < minNonEmptyCells ? 0 : bestIdx;
  }

  function normalizeHeaders(raw: any[]) {
    const seen: Record<string, number> = {};
    return raw.map((h, i) => {
      const s = String(h ?? "").trim();
      const base = s === "" ? `column_${i + 1}` : s;
      let key = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s\-]/g, "").trim().replace(/\s+/g, "_").replace(/-+/g, "_").toLowerCase();
      if (!key) key = `column_${i + 1}`;
      if (seen[key]) { seen[key] += 1; key = `${key}_${seen[key]}`; } else seen[key] = 1;
      return key;
    });
  }

  function cleanCell(v: any) { return String(v ?? "").replace(/\s+/g, " ").trim(); }
  function isStopMarkerB(cellB: any) { return cleanCell(cellB).toLowerCase().startsWith("diketahui"); }

  function readMetaPairsFromAoA(rawAoA: any[][]) {
    const metaPairs: MetaPair[] = [];
    for (const p of [{ row: 1, keyCol: 1, valCol: 2 }, { row: 2, keyCol: 1, valCol: 2 }, { row: 3, keyCol: 1, valCol: 2 }]) {
      const key = cleanCell(rawAoA?.[p.row]?.[p.keyCol]);
      const value = cleanCell(rawAoA?.[p.row]?.[p.valCol]);
      if (key && value) metaPairs.push({ key, value });
    }
    const metaMap: Record<string, string> = {};
    metaPairs.forEach(({ key, value }) => {
      const k = key.toLowerCase();
      if (k.includes("kabupaten")) metaMap.kabupaten = value;
      else if (k.includes("puskesmas")) metaMap.puskesmas = value;
      else if (k.includes("bulan")) metaMap.bulanTahun = value.replace(/^:\s*/, "").replace(/\s*\/\s*/g, " ").trim();
    });
    return { metaPairs, metaMap };
  }

  function fillMergedCellsFromSheet(ws: XLSX.WorkSheet, aoa: any[][]) {
    const merges = ws?.["!merges"] as any[] || [];
    for (const m of merges) {
      while (aoa.length <= m.e.r) aoa.push([]);
      const startAddr = XLSX.utils.encode_cell({ r: m.s.r, c: m.s.c });
      const startCell = ws[startAddr];
      const startVal = startCell && typeof startCell.v !== "undefined" ? startCell.v : aoa[m.s.r]?.[m.s.c] ?? "";
      for (let r = m.s.r; r <= m.e.r; r++) {
        aoa[r] = aoa[r] || [];
        for (let c = m.s.c; c <= m.e.c; c++) {
          const current = aoa[r][c];
          if (current === "" || current === null || current === undefined) aoa[r][c] = startVal;
        }
      }
    }
  }

  function processWorksheet(workbook: XLSX.WorkBook, sheetName: string): UploadPayload | null {
    try {
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return null;
      const rawAoA: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
      fillMergedCellsFromSheet(worksheet, rawAoA);
      const { metaPairs, metaMap } = readMetaPairsFromAoA(rawAoA);
      const visibleStartRow = 5;
      let stopRowIdx = rawAoA.length;
      for (let r = visibleStartRow; r < rawAoA.length; r++) {
        if (isStopMarkerB(rawAoA[r]?.[1])) { stopRowIdx = r; break; }
      }
      const sliced = rawAoA.slice(visibleStartRow, stopRowIdx);
      const allMerges = (worksheet["!merges"] as any[]) || [];

      const buildLayout = (useMerges: boolean) => {
        let headerStart = -1, headerEnd = -1;
        let mergesForHeader: any[] = [];
        if (useMerges && allMerges.length > 0) {
          const headerBandEnd = Math.min(stopRowIdx - 1, visibleStartRow + 12);
          mergesForHeader = allMerges.filter((m: any) => m?.s?.r >= visibleStartRow && m.s.r <= headerBandEnd && m.e.r <= headerBandEnd);
          if (mergesForHeader.length > 0) {
            headerStart = Math.max(visibleStartRow, Math.min(...mergesForHeader.map((m: any) => m.s.r)));
            headerEnd = Math.min(stopRowIdx - 1, Math.max(...mergesForHeader.map((m: any) => m.e.r)));
          }
        }
        if (headerStart === -1 || headerEnd === -1 || headerEnd >= stopRowIdx - 1) {
          const localOffset = detectHeaderRow(sliced, 40, 3);
          headerStart = visibleStartRow + localOffset;
          headerEnd = headerStart;
          if (!useMerges) mergesForHeader = [];
        }
        const rawHeaderRow = rawAoA[headerEnd] ?? [];
        const firstNonEmptyCol = rawHeaderRow.findIndex((c: any) => cleanCell(c) !== "");
        const leftCol = firstNonEmptyCol >= 0 ? firstNonEmptyCol : 0;
        const trimmedHeaderRow = rawHeaderRow.slice(leftCol);
        const headerKeys = normalizeHeaders(trimmedHeaderRow);
        const headerLabels = trimmedHeaderRow.map((c: any) => cleanCell(c));
        const bodyAoA = rawAoA.slice(headerEnd + 1, stopRowIdx);
        const cleanedRows = bodyAoA
          .filter((rowArr) => rowArr.some((x: any) => cleanCell(x) !== ""))
          .map((rowArr, idx) => {
            const obj: Record<string, any> = {};
            headerKeys.forEach((k, i) => { const v = rowArr?.[leftCol + i] ?? ""; obj[k] = typeof v === "string" ? v.trim() : v; });
            obj.id = `row_${Date.now()}_${idx + 1}`;
            return obj;
          });
        const rawHeaderBlockRows = rawAoA.slice(headerStart, headerEnd + 1);
        const normalizedMerges = mergesForHeader.map((m: any) => ({ s: { r: m.s.r - headerStart, c: m.s.c - leftCol }, e: { r: m.e.r - headerStart, c: m.e.c - leftCol } }));
        return { cleanedRows, headerKeys, headerLabels, headerOrder: [...headerKeys], headerBlock: { start: headerStart, end: headerEnd, rows: rawHeaderBlockRows.map((r: any[]) => r.slice(leftCol)), merges: normalizedMerges } };
      };

      let layout = buildLayout(true);
      if (!layout.cleanedRows?.length) layout = buildLayout(false);
      if (!layout.cleanedRows?.length) return null;

      return { kabupaten: metaMap.kabupaten ?? "", puskesmas: metaMap.puskesmas ?? "", bulanTahun: metaMap.bulanTahun ?? "", metaPairs, rows: layout.cleanedRows, headerKeys: layout.headerKeys, headerLabels: layout.headerLabels, headerOrder: layout.headerOrder, sourceSheetName: sheetName, headerBlock: layout.headerBlock };
    } catch { return null; }
  }

  const handleFile = (file: File) => {
    setFileError(null);
    clearWorksheetSelectionState();
    if (file.size > MAX_FILE_SIZE) { setFileError("File terlalu besar. Maksimum 10MB."); return; }
    setFileName(file.name);
    try { sessionStorage.setItem("uploadFileName", file.name); } catch {}
    const reader = new FileReader();
    reader.onerror = () => setFileError("Gagal membaca file.");
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        if (!workbook.SheetNames?.length) throw new Error("No sheets");
        const processedSheets: WorksheetData[] = [];
        for (const sn of workbook.SheetNames) {
          const p = processWorksheet(workbook, sn);
          if (p) processedSheets.push({ ...p, worksheetName: sn });
        }
        if (!processedSheets.length) { setFileError("Tidak ada data terbaca."); return; }
        if (processedSheets.length === 1) {
          proceedToPreview({ ...processedSheets[0], fileName: file.name });
          return;
        }

        setPendingWorksheets(processedSheets);
        setSelectedWorksheetIndex(0);
        setUploadStep(2);
      } catch { setFileError("Error parsing file."); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleConfirmWorksheetSelection = () => {
    if (selectedWorksheetIndex === null || !pendingWorksheets[selectedWorksheetIndex]) {
      setFileError("Pilih satu worksheet terlebih dahulu.");
      return;
    }

    const selectedWorksheet = pendingWorksheets[selectedWorksheetIndex];
    proceedToPreview({ ...selectedWorksheet, fileName: fileName ?? undefined });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Unggah Dokumen</h2>
        <p className="text-sm text-muted-foreground mt-1">Import data kesehatan lansia ke dalam sistem</p>
        {fileName && <div className="text-xs text-muted-foreground mt-1">File terakhir: <strong>{fileName}</strong></div>}
      </div>

      {/* Steps */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle style={{ fontSize: "1.125rem" }}>Langkah-langkah Unggah</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {steps.map((step) => (
              <div key={step.number} className="flex items-start gap-3">
                <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm ${
                  step.status === "completed" ? "bg-green-100 text-green-700" : step.status === "active" ? "bg-foreground text-background" : "bg-gray-100 text-gray-500"
                }`} style={{ fontWeight: 600 }}>
                  {step.status === "completed" ? <CheckCircle className="w-5 h-5" /> : step.number}
                </div>
                <div className="flex-1">
                  <h3 className="text-sm" style={{ fontWeight: 600 }}>{step.title}</h3>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                <Badge
                  variant={step.status === "completed" ? "secondary" : step.status === "active" ? "outline" : "outline"}
                  className="text-xs"
                >
                  {step.status === "completed" ? "Selesai" : step.status === "active" ? "Aktif" : "Menunggu"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upload Area */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle style={{ fontSize: "1.125rem" }}>Area Unggah File</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragActive ? "border-foreground bg-muted" : "border-border bg-muted/30"}`}
            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
          >
            <div className="flex flex-col items-center space-y-3">
              <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center">
                <Upload className="w-7 h-7 text-foreground" />
              </div>
              <div>
                <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }} className="mb-1">Seret file ke sini atau klik untuk browse</h3>
                <p className="text-sm text-muted-foreground mb-3">.xlsx, .csv, .xls (Maks 10MB)</p>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} className={`gap-2 ${btnAnim}`}>
                <FileText className="w-4 h-4" />
                Pilih File
              </Button>
              <input ref={fileInputRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
            {fileError && <div className="mt-3 text-red-600 text-center text-sm">{fileError}</div>}
          </div>

          {uploadStep > 1 && (
            <div className="mt-4 p-3 bg-secondary rounded-lg">
              <div className="flex items-center gap-2">
                {uploadStep === 2 ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-foreground"></div> : <CheckCircle className="w-5 h-5 text-green-600" />}
                <span className="text-sm">{uploadStep === 2 ? "Memproses file..." : "File berhasil divalidasi"}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {pendingWorksheets.length > 1 && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle style={{ fontSize: "1.125rem" }}>Pilih Worksheet Yang Akan Diupload</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                File ini memiliki beberapa lembar kerja. Pilih tepat satu lembar kerja untuk dilanjutkan ke pratinjau dan unggah.
              </p>

              <Select
                value={selectedWorksheetIndex !== null ? String(selectedWorksheetIndex) : undefined}
                onValueChange={(v) => setSelectedWorksheetIndex(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih worksheet..." />
                </SelectTrigger>
                <SelectContent>
                  {pendingWorksheets.map((worksheet, idx) => (
                    <SelectItem key={worksheet.worksheetName} value={String(idx)}>
                      {worksheet.worksheetName} - {worksheet.puskesmas || "-"} | {worksheet.bulanTahun || "-"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex justify-end">
                <Button onClick={handleConfirmWorksheetSelection} className={btnAnim}>
                  Lanjutkan Dengan Worksheet Ini
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
