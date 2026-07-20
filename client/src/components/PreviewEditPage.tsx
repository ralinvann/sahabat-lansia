import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "./ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "./ui/select";
import { CheckCircle, Edit3, Save, X, AlertCircle, FileText, Trash2, Undo2 } from "lucide-react";
import { api } from "../lib/api";

type UploadPayload = {
  kabupaten?: string;
  puskesmas?: string;
  desa?: string;
  bulanTahun?: string;
  metaPairs?: { key: string; value: string }[];
  rows: any[];
  headerKeys: string[];
  headerLabels: string[];
  headerOrder: string[];
  fileName?: string;
  sourceSheetName?: string;
  headerBlock?: { start: number; end: number; rows: any[][]; merges: any[] };
};

type WorksheetData = UploadPayload & { worksheetName: string };
type MultiWorksheetPayload = { fileName?: string; worksheets: WorksheetData[]; activeWorksheetIndex?: number };
type LocationConfig = { kabupaten: string; desaList: string[] };
type PreviewEditPageProps = { initialData?: any[] | UploadPayload | null; onDone?: () => void; onCancel?: () => void };
type RemovedRowEntry = { row: any; index: number; worksheetIndex: number };

function excelSerialToDate(serial: number): Date {
  const excelEpoch = new Date(1899, 11, 30);
  return new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
}

function dateToExcelSerial(date: Date): number {
  const excelEpoch = new Date(1899, 11, 30);
  return Math.floor((date.getTime() - excelEpoch.getTime()) / (24 * 60 * 60 * 1000));
}

function formatDateDDMMYYYY(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

function parseDateDDMMYYYY(dateStr: string): Date | null {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts.map(Number);
  if ([day, month, year].some(isNaN) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function isDateField(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("tanggal") || lower.includes("tgl") || lower.includes("date");
}

function normalizeFieldKey(key: string): string {
  return String(key).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isNikField(key: string): boolean {
  const normalized = normalizeFieldKey(key);
  if (!normalized) return false;
  if (normalized === "nik") return true;
  const tokens = normalized.split("_").filter(Boolean);
  return tokens.includes("nik") || tokens.includes("noktp") || (tokens.includes("ktp") && (tokens.includes("no") || tokens.includes("nomor")));
}

function formatGenderDisplay(value: any): string {
  if (!value) return "-";
  const str = String(value).trim().toLowerCase();
  const hasL = str.includes("l"), hasP = str.includes("p");
  if (hasL && !hasP) return "Laki-laki";
  if (hasP && !hasL) return "Perempuan";
  if (hasL && hasP) return "Ambigu";
  return "Tidak Valid";
}

function removeTrailingEmptyColumns(payload: UploadPayload): UploadPayload {
  if (!payload.rows?.length) return payload;
  const headerKeys = payload.headerOrder ?? payload.headerKeys ?? [];
  if (!headerKeys.length) return payload;
  let lastNonEmpty = -1;
  for (let i = headerKeys.length - 1; i >= 0; i--) {
    if (payload.rows.some((row) => { const v = row[headerKeys[i]]; return v !== null && v !== undefined && String(v).trim() !== ""; })) {
      lastNonEmpty = i; break;
    }
  }
  if (lastNonEmpty === -1 || lastNonEmpty === headerKeys.length - 1) return payload;
  const newKeys = headerKeys.slice(0, lastNonEmpty + 1);
  return {
    ...payload,
    rows: payload.rows.map((row) => { const nr: Record<string, any> = { id: row.id }; newKeys.forEach((k) => { nr[k] = row[k]; }); return nr; }),
    headerKeys: newKeys,
    headerLabels: payload.headerLabels?.slice(0, lastNonEmpty + 1) ?? newKeys.map((k) => String(k).toUpperCase()),
    headerOrder: newKeys,
  };
}

function isMultiWorksheet(data: any): data is MultiWorksheetPayload {
  return data && typeof data === "object" && Array.isArray(data.worksheets) && data.worksheets.length > 0 && "worksheetName" in data.worksheets[0];
}

const btnAnim = "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]";

export function PreviewEditPage({ initialData = null, onDone, onCancel }: PreviewEditPageProps) {
  const [payload, setPayload] = useState<UploadPayload | null>(null);
  const [multiWorksheetPayload, setMultiWorksheetPayload] = useState<MultiWorksheetPayload | null>(null);
  const [activeWorksheetIndex, setActiveWorksheetIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRows, setEditedRows] = useState<Record<string, Record<string, any>>>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [locationConfigs, setLocationConfigs] = useState<LocationConfig[]>([]);
  const [selectedKabupatenConfig, setSelectedKabupatenConfig] = useState<string>("");
  const [selectedDesa, setSelectedDesa] = useState<string>("");
  const [removedRows, setRemovedRows] = useState<RemovedRowEntry[]>([]);

  function payloadFromArray(arr: any[]): UploadPayload {
    const rows = (arr || []).map((r: any, i: number) => {
      const obj = { ...r };
      if (obj.id == null) obj.id = `row_${Date.now()}_${i + 1}`;
      Object.keys(obj).forEach((k) => { if (typeof obj[k] === "string") obj[k] = obj[k].trim(); });
      return obj;
    });
    const headerKeys = rows.length > 0 ? Object.keys(rows[0]).filter((k) => k !== "id") : [];
    return { rows, headerKeys, headerLabels: headerKeys.map((k) => String(k).toUpperCase()), headerOrder: [...headerKeys] };
  }

  function normalizeStored(payloadOrArray: any): UploadPayload | MultiWorksheetPayload | null {
    if (!payloadOrArray) return null;
    if (Array.isArray(payloadOrArray)) return payloadFromArray(payloadOrArray);
    if (isMultiWorksheet(payloadOrArray)) return payloadOrArray;
    if (payloadOrArray.rows && (payloadOrArray.headerKeys || payloadOrArray.headerOrder)) {
      const rows = (payloadOrArray.rows || []).map((r: any, i: number) => {
        const obj = { ...r };
        if (obj.id == null) obj.id = `row_${Date.now()}_${i + 1}`;
        Object.keys(obj).forEach((k) => { if (typeof obj[k] === "string") obj[k] = obj[k].trim(); });
        return obj;
      });
      const headerKeys = payloadOrArray.headerOrder ?? payloadOrArray.headerKeys ?? [];
      return removeTrailingEmptyColumns({
        ...payloadOrArray, rows, headerKeys,
        headerLabels: payloadOrArray.headerLabels ?? headerKeys.map((k: string) => String(k).toUpperCase()),
        headerOrder: headerKeys,
      });
    }
    return null;
  }

  useEffect(() => {
    const setFromNormalized = (normalized: UploadPayload | MultiWorksheetPayload) => {
      if (isMultiWorksheet(normalized)) {
        setMultiWorksheetPayload(normalized);
        setActiveWorksheetIndex(normalized.activeWorksheetIndex ?? 0);
        setPayload(removeTrailingEmptyColumns(normalized.worksheets[normalized.activeWorksheetIndex ?? 0]));
      } else {
        setPayload(normalized as UploadPayload);
        setMultiWorksheetPayload(null);
      }
    };

    if (initialData && !Array.isArray(initialData)) {
      const n = normalizeStored(initialData);
      if (n) { setFromNormalized(n); return; }
    }
    if (initialData && Array.isArray(initialData)) {
      setPayload(payloadFromArray(initialData));
      setMultiWorksheetPayload(null);
      return;
    }
    try {
      const s = sessionStorage.getItem("previewData");
      if (s) {
        const parsed = JSON.parse(s);
        const n = normalizeStored(parsed);
        if (n) { setFromNormalized(n); return; }
        if (Array.isArray(parsed)) { setPayload(payloadFromArray(parsed)); setMultiWorksheetPayload(null); return; }
      }
    } catch {}
    setPayload(null);
    setMultiWorksheetPayload(null);
  }, [initialData]);

  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const { data } = await api.get("/locations");
        const items = Array.isArray(data?.items) ? data.items : [];
        setLocationConfigs(items.map((it: any) => ({
          kabupaten: String(it?.kabupaten ?? "").trim(),
          desaList: Array.isArray(it?.desaList) ? it.desaList.map((d: any) => String(d ?? "").trim()).filter(Boolean) : [],
        })));
      } catch {}
    };
    fetchLocations();
  }, []);

  const rows = payload?.rows ?? null;
  const headerKeys = payload?.headerOrder ?? payload?.headerKeys ?? [];
  const headerLabels = payload?.headerLabels ?? headerKeys.map((k) => String(k).toUpperCase());
  const kabupatenOptions = useMemo(
    () => locationConfigs.map((it) => String(it.kabupaten ?? "").trim()).filter(Boolean),
    [locationConfigs]
  );

  useEffect(() => {
    const payloadKabupaten = String(payload?.kabupaten ?? "").trim();
    if (payloadKabupaten) {
      setSelectedKabupatenConfig(payloadKabupaten);
      return;
    }
    if (!selectedKabupatenConfig && kabupatenOptions.length === 1) {
      setSelectedKabupatenConfig(kabupatenOptions[0]);
    }
  }, [payload?.kabupaten, kabupatenOptions]);

  const activeKabupatenKey = String(selectedKabupatenConfig || payload?.kabupaten || "")
    .trim()
    .toLowerCase();
  const desaOptions = useMemo(() => {
    if (!activeKabupatenKey) return [] as string[];
    return locationConfigs.find((it) => String(it.kabupaten ?? "").trim().toLowerCase() === activeKabupatenKey)?.desaList ?? [];
  }, [activeKabupatenKey, locationConfigs]);

  useEffect(() => {
    const payloadDesa = String(payload?.desa ?? "").trim();
    if (payloadDesa) { setSelectedDesa(payloadDesa); return; }
    if (desaOptions.length === 1) { setSelectedDesa(desaOptions[0]); return; }
    if (selectedDesa && !desaOptions.includes(selectedDesa)) setSelectedDesa("");
  }, [payload?.desa, desaOptions]);

  const columnMinWidthsCh = useMemo(() => {
    return headerKeys.map((key, i) => {
      const headerLen = String(headerLabels[i] ?? key ?? "").trim().length;
      let longestValueLen = 0;
      for (const row of rows ?? []) {
        const val = editedRows[String(row.id)]?.[key] ?? row[key];
        longestValueLen = Math.max(longestValueLen, String(val ?? "").trim().length);
      }
      return Math.max(12, Math.min(48, Math.max(headerLen, longestValueLen) + 2));
    });
  }, [headerKeys, headerLabels, rows, editedRows]);

  const getCellError = (row: any, key: string): string | null => {
    const lowerKey = key.toLowerCase();
    const cellValue = row[key];
    if ((lowerKey === "nama" || lowerKey.includes("nama")) && (!cellValue || !String(cellValue).trim())) return "Nama wajib diisi";
    if (isNikField(key)) {
      if (!cellValue || !String(cellValue).trim()) return "NIK wajib diisi";
      const nikNum = Number(String(cellValue).trim());
      if (Number.isNaN(nikNum) || !Number.isInteger(nikNum) || nikNum <= 0) return "NIK harus angka bulat positif";
      const nikCount = rows?.filter((r) => { const rnik = editedRows[String(r.id)]?.[key] ?? r[key]; return rnik && Number(rnik) === nikNum; }).length ?? 0;
      if (nikCount > 1) return `NIK duplikat (${nikCount}x)`;
    }
    if (lowerKey === "umur" || lowerKey.includes("umur")) {
      if (cellValue === null || cellValue === "") return "Umur wajib diisi";
      const numValue = Number(cellValue);
      if (Number.isNaN(numValue) || !Number.isInteger(numValue)) return "Umur harus angka bulat";
      if (numValue < 0 || numValue > 150) return "Umur tidak valid (0-150)";
    }
    if (lowerKey === "jk" || (lowerKey.includes("jenis") && lowerKey.includes("kelamin"))) {
      if (!cellValue || !String(cellValue).trim()) return "Jenis Kelamin wajib diisi";
      const g = String(cellValue).trim().toLowerCase();
      if (!g.includes("l") && !g.includes("p")) return "JK harus 'l' atau 'p'";
    }
    if (isDateField(key) && cellValue !== null && cellValue !== "") {
      if (typeof cellValue === "string") { if (!parseDateDDMMYYYY(cellValue.trim())) return "Format tanggal: DD/MM/YYYY"; }
      else { const n = Number(cellValue); if (Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > 100000) return "Tanggal tidak valid"; }
    }
    return null;
  };

  const hasRowError = (row: any): boolean => {
    return headerKeys.some((key) => getCellError(row, key) !== null);
  };

  const validationResults = useMemo(() => {
    if (!rows) return { total: 0, valid: 0, warning: 0, error: 0 };
    let valid = 0, errorCount = 0;
    rows.forEach((r) => {
      const edits = editedRows[String(r.id)];
      hasRowError(edits ? { ...r, ...edits } : r) ? errorCount++ : valid++;
    });
    return { total: rows.length, valid, warning: 0, error: errorCount };
  }, [rows, editedRows, headerKeys]);

  const confirmDisabledReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!rows || rows.length === 0) reasons.push("Belum ada data untuk diimpor.");
    if (!selectedDesa) reasons.push("Desa belum dipilih.");
    if (validationResults.error > 0) reasons.push(`Masih ada ${validationResults.error} error pada data.`);
    return reasons;
  }, [rows, selectedDesa, validationResults.error]);

  const handleCellChange = (rowId: string | number, key: string, value: any) => {
    setEditedRows((prev) => ({ ...prev, [String(rowId)]: { ...(prev[String(rowId)] || {}), [key]: value } }));
  };

  const persistPreviewState = (nextPayload: UploadPayload | null, nextMultiWorksheetPayload?: MultiWorksheetPayload | null) => {
    try {
      const dataToSave = nextMultiWorksheetPayload
        ? { ...nextMultiWorksheetPayload, activeWorksheetIndex }
        : nextPayload;
      if (dataToSave) sessionStorage.setItem("previewData", JSON.stringify(dataToSave));
      else sessionStorage.removeItem("previewData");
    } catch {}
  };

  const updateCurrentRows = (
    rowUpdater: (currentRows: any[]) => any[],
    options?: { resetEdits?: boolean; nextRemovedRows?: RemovedRowEntry[] }
  ) => {
    if (!payload) return;

    const nextRows = rowUpdater(payload.rows);
    const nextPayload = { ...payload, rows: nextRows };
    let nextMultiPayload = multiWorksheetPayload;

    if (multiWorksheetPayload) {
      nextMultiPayload = {
        ...multiWorksheetPayload,
        activeWorksheetIndex,
        worksheets: multiWorksheetPayload.worksheets.map((worksheet, index) =>
          index === activeWorksheetIndex ? { ...worksheet, rows: nextRows } : worksheet
        ),
      };
      setMultiWorksheetPayload(nextMultiPayload);
    }

    setPayload(nextPayload);
    if (options?.resetEdits) setEditedRows({});
    if (options?.nextRemovedRows) setRemovedRows(options.nextRemovedRows);
    persistPreviewState(nextPayload, nextMultiPayload);
  };

  const handleRemoveRow = (rowId: string | number) => {
    if (!payload) return;
    const targetIndex = payload.rows.findIndex((row) => String(row.id) === String(rowId));
    if (targetIndex < 0) return;

    const removedEntry: RemovedRowEntry = {
      row: payload.rows[targetIndex],
      index: targetIndex,
      worksheetIndex: activeWorksheetIndex,
    };

    const nextRemovedRows = [...removedRows, removedEntry];
    updateCurrentRows(
      (currentRows) => currentRows.filter((row) => String(row.id) !== String(rowId)),
      { nextRemovedRows }
    );

    setEditedRows((prev) => {
      const next = { ...prev };
      delete next[String(rowId)];
      return next;
    });
    setSuccessMsg("Baris dihapus dari preview. Gunakan Undo untuk mengembalikan.");
    setTimeout(() => setSuccessMsg(null), 2000);
  };

  const handleUndoRemoveRow = () => {
    const lastRemoved = removedRows[removedRows.length - 1];
    if (!lastRemoved) return;

    const nextRemovedRows = removedRows.slice(0, -1);
    if (multiWorksheetPayload && lastRemoved.worksheetIndex !== activeWorksheetIndex) {
      const nextMultiPayload = {
        ...multiWorksheetPayload,
        activeWorksheetIndex,
        worksheets: multiWorksheetPayload.worksheets.map((worksheet, index) => {
          if (index !== lastRemoved.worksheetIndex) return worksheet;
          const nextRows = [...worksheet.rows];
          nextRows.splice(Math.min(lastRemoved.index, nextRows.length), 0, lastRemoved.row);
          return { ...worksheet, rows: nextRows };
        }),
      };
      setMultiWorksheetPayload(nextMultiPayload);
      persistPreviewState(payload, nextMultiPayload);
      setRemovedRows(nextRemovedRows);
      setSuccessMsg("Baris berhasil dikembalikan.");
      setTimeout(() => setSuccessMsg(null), 1600);
      return;
    }

    updateCurrentRows((currentRows) => {
      const nextRows = [...currentRows];
      nextRows.splice(Math.min(lastRemoved.index, nextRows.length), 0, lastRemoved.row);
      return nextRows;
    }, { nextRemovedRows });
    setSuccessMsg("Baris berhasil dikembalikan.");
    setTimeout(() => setSuccessMsg(null), 1600);
  };

  const handleSaveAllChanges = () => {
    if (!payload) return;
    const newRows = payload.rows.map((row) => {
      const edits = editedRows[String(row.id)];
      if (!edits) return row;
      const updated: Record<string, any> = { ...row };
      Object.entries(edits).forEach(([key, value]) => {
        if (isDateField(key) && value !== null && value !== "") {
          const parsed = parseDateDDMMYYYY(String(value).trim());
          updated[key] = parsed ? dateToExcelSerial(parsed) : value;
        } else updated[key] = value;
      });
      return updated;
    });
    const newPayload = { ...payload, rows: newRows };
    setPayload(newPayload);
    if (multiWorksheetPayload) {
      const nextMultiPayload = {
        ...multiWorksheetPayload,
        activeWorksheetIndex,
        worksheets: multiWorksheetPayload.worksheets.map((worksheet, index) =>
          index === activeWorksheetIndex ? { ...worksheet, rows: newRows } : worksheet
        ),
      };
      setMultiWorksheetPayload(nextMultiPayload);
      persistPreviewState(newPayload, nextMultiPayload);
    } else {
      persistPreviewState(newPayload);
    }
    setEditedRows({});
    setIsEditing(false);
    setSuccessMsg("Semua perubahan disimpan.");
    setTimeout(() => setSuccessMsg(null), 1600);
  };

  const handleCancelImport = (): void => {
    try { sessionStorage.removeItem("previewData"); sessionStorage.removeItem("uploadStep"); sessionStorage.removeItem("uploadFileName"); } catch {}
    try { window.dispatchEvent(new CustomEvent("upload-reset")); } catch {}
    if (typeof onCancel === "function") { onCancel(); return; }
    setPayload(null);
    setMultiWorksheetPayload(null);
    setSuccessMsg("Import dibatalkan.");
    setTimeout(() => setSuccessMsg(null), 1600);
  };

  const handleSwitchWorksheet = (sheetIndex: number): void => {
    if (!multiWorksheetPayload || sheetIndex < 0 || sheetIndex >= multiWorksheetPayload.worksheets.length) return;
    setActiveWorksheetIndex(sheetIndex);
    setPayload(removeTrailingEmptyColumns(multiWorksheetPayload.worksheets[sheetIndex]));
    setIsEditing(false);
    setEditedRows({});
  };

  const handleConfirmImport = async (): Promise<void> => {
    if (!rows || rows.length === 0) { setErrorMsg("Tidak ada data untuk diimpor."); return; }
    if (validationResults.error > 0) { setErrorMsg("Perbaiki error sebelum konfirmasi."); return; }
    if (!selectedDesa) { setErrorMsg("Pilih desa terlebih dahulu."); return; }
    setLoading(true);
    setErrorMsg(null);
    try {
      const wsSource = multiWorksheetPayload && multiWorksheetPayload.worksheets.length > 1
        ? multiWorksheetPayload.worksheets[activeWorksheetIndex]
        : payload;
      if (!wsSource) throw new Error("Worksheet tidak ditemukan.");
      const body = {
        fileName: multiWorksheetPayload?.fileName ?? payload?.fileName,
        kabupaten: wsSource.kabupaten ?? "",
        desa: selectedDesa,
        bulanTahun: wsSource.bulanTahun ?? "",
        worksheets: [{
          worksheetName: (wsSource as any).worksheetName ?? wsSource.sourceSheetName ?? "Sheet1",
          puskesmas: wsSource.puskesmas ?? "",
          desa: selectedDesa,
          kabupaten: wsSource.kabupaten ?? "",
          bulanTahun: wsSource.bulanTahun ?? "",
          metaPairs: wsSource.metaPairs ?? [],
          headerKeys: wsSource.headerKeys ?? wsSource.headerOrder ?? [],
          headerLabels: wsSource.headerLabels ?? [],
          headerOrder: wsSource.headerOrder ?? wsSource.headerKeys ?? [],
          rowData: rows,
          sourceSheetName: wsSource.sourceSheetName,
          headerBlock: wsSource.headerBlock,
        }],
      };
      const { data } = await api.post("/elderly-reports", body);
      if (!data?.reportId && !data?.success) throw new Error("Response tidak valid dari server.");
      setSuccessMsg("Data berhasil diimpor ke database.");
      sessionStorage.removeItem("previewData");
      if (typeof onDone === "function") onDone();
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.message || e?.message || "Gagal mengimpor data.");
    } finally {
      setLoading(false);
    }
  };

  if (!rows) {
    return (
      <div className="p-6 space-y-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Pratinjau dan Edit Data
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Tidak ada data preview. Silakan unggah file terlebih dahulu.</p>
          </CardContent>
        </Card>
        {errorMsg && (
          <Card className="shadow-sm border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-2 text-destructive">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm">{errorMsg}</p>
              </div>
            </CardContent>
          </Card>
        )}
        {successMsg && (
          <Card className="shadow-sm border-primary">
            <CardContent className="pt-6">
              <div className="flex items-start gap-2 text-primary">
                <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm">{successMsg}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header Section */}
      <Card className="shadow-sm">
        <CardHeader>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5" />
                Pratinjau dan Edit Data
              </CardTitle>
              <p className="text-sm text-muted-foreground">Review dan edit data sebelum menyimpan ke sistem</p>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => { if (isEditing) setEditedRows({}); setIsEditing(!isEditing); }}
                className={`gap-2 ${btnAnim}`}
              >
                <Edit3 className="w-4 h-4" />
                {isEditing ? "Batalkan" : "Edit Data"}
              </Button>
              {isEditing && (
                <>
                  <Button
                    variant="outline"
                    onClick={handleUndoRemoveRow}
                    disabled={removedRows.length === 0}
                    className={`gap-2 ${btnAnim}`}
                  >
                    <Undo2 className="w-4 h-4" />
                    Undo Hapus
                  </Button>
                  <Button onClick={handleSaveAllChanges} className={`gap-2 ${btnAnim}`}>
                    <Save className="w-4 h-4" />
                    Simpan Perubahan
                  </Button>
                </>
              )}
              {!isEditing && (
                <Button
                  variant="outline"
                  onClick={() => {
                    try {
                      const dataToSave = multiWorksheetPayload ? { ...multiWorksheetPayload, activeWorksheetIndex } : payload;
                      if (dataToSave) sessionStorage.setItem("previewData", JSON.stringify(dataToSave));
                      setSuccessMsg("Disimpan sementara.");
                      setTimeout(() => setSuccessMsg(null), 1600);
                    } catch {}
                  }}
                  className={`gap-2 ${btnAnim}`}
                >
                  <Save className="w-4 h-4" />
                  Simpan Sementara
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">File:</span>{" "}
              <span className="font-medium">{payload?.fileName ?? multiWorksheetPayload?.fileName ?? "-"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Kabupaten:</span>{" "}
              <span className="font-medium">{payload?.kabupaten ?? "-"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Puskesmas:</span>{" "}
              <span className="font-medium">{payload?.puskesmas ?? "-"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Bulan/Tahun:</span>{" "}
              <span className="font-medium">{payload?.bulanTahun ?? "-"}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Worksheet Tabs */}
      {multiWorksheetPayload && multiWorksheetPayload.worksheets.length > 1 && (
        <Card className="shadow-sm">
          <CardHeader>
              <CardTitle>Pilih Lembar Kerja</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {multiWorksheetPayload.worksheets.map((ws, idx) => (
                <Button
                  key={idx}
                  variant={activeWorksheetIndex === idx ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleSwitchWorksheet(idx)}
                  className={btnAnim}
                >
                  {ws.worksheetName || `Sheet ${idx + 1}`}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Summary */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Hasil Validasi Data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Location Selection */}
          <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Kabupaten</label>
                <Select value={selectedKabupatenConfig} onValueChange={setSelectedKabupatenConfig}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kabupaten..." />
                  </SelectTrigger>
                  <SelectContent>
                    {kabupatenOptions.map((kabupaten) => (
                      <SelectItem key={kabupaten} value={kabupaten}>
                        {kabupaten}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Desa</label>
                <Select value={selectedDesa} onValueChange={setSelectedDesa}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih desa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {desaOptions.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {desaOptions.length === 0 && (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Belum ada daftar desa untuk kabupaten ini.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Validation Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-3xl font-bold text-blue-600">{validationResults.total}</div>
              <div className="text-sm text-blue-700 mt-1">Total Data</div>
            </div>
            <div className="text-center p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="text-3xl font-bold text-primary">{validationResults.valid}</div>
              <div className="text-sm text-primary mt-1">Sesuai</div>
            </div>
            <div className="text-center p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-3xl font-bold text-red-600">{validationResults.error}</div>
              <div className="text-sm text-red-700 mt-1">Kesalahan</div>
            </div>
          </div>

          {/* Legend */}
          <div className="border-t pt-4">
            <h4 className="font-medium text-sm mb-3">Keterangan Status</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="w-1 h-12 bg-red-500 rounded-full shrink-0"></div>
                <div>
                  <div className="text-sm font-medium text-red-700">Error (Merah)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    NIK (INTEGER, UNIQUE), Umur, Jenis Kelamin
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                <div className="w-1 h-12 bg-primary rounded-full shrink-0"></div>
                <div>
                  <div className="text-sm font-medium text-primary">Valid (Hijau)</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Data lengkap dan siap disimpan
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Preview Data Kesehatan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {payload?.headerBlock ? (
                  (() => {
                    const hb = payload.headerBlock!;
                    const merges = (hb.merges || []).filter((m: any) => m && typeof m.s?.c === "number");
                    const maxCols = headerKeys.length;
                    const headerHeight = Math.max(1, (hb.rows || []).length);
                    const validMerges = merges.filter((m: any) => {
                      const startC = Math.max(0, m.s.c);
                      return startC < maxCols && m.e.c >= 0 && m.s.r >= 0 && m.e.r < headerHeight;
                    }).map((m: any) => ({ ...m, s: { r: m.s.r, c: Math.max(0, m.s.c) }, e: { r: m.e.r, c: Math.min(maxCols - 1, m.e.c) } }));
                    const isInsideMerge = (r: number, c: number) => validMerges.some((m: any) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c);
                    const getMergeAt = (r: number, c: number) => validMerges.find((m: any) => m.s.r === r && m.s.c === c);
                    return Array.from({ length: headerHeight }).map((_, rowIdx) => {
                      const consumed = new Set<number>();
                      return (
                        <TableRow key={`hdr-${rowIdx}`}>
                          {Array.from({ length: maxCols }).map((__, colIdx) => {
                            if (consumed.has(colIdx)) return null;
                            const merge = getMergeAt(rowIdx, colIdx);
                            if (merge) {
                              const colSpan = Math.max(1, merge.e.c - merge.s.c + 1);
                              const rowSpan = Math.max(1, merge.e.r - merge.s.r + 1);
                              for (let cc = merge.s.c; cc <= merge.e.c; cc++) consumed.add(cc);
                              const text = hb.rows[rowIdx]?.[merge.s.c] ?? "";
                              return <TableHead key={`h-${rowIdx}-${colIdx}`} colSpan={colSpan} rowSpan={rowSpan} className="text-center text-xs" style={{ minWidth: `${columnMinWidthsCh[colIdx] ?? 12}ch` }}>{String(text ?? "").trim()}</TableHead>;
                            }
                            if (isInsideMerge(rowIdx, colIdx)) { consumed.add(colIdx); return null; }
                            consumed.add(colIdx);
                            const text = hb.rows[rowIdx]?.[colIdx] ?? headerLabels[colIdx] ?? headerKeys[colIdx] ?? "";
                            return <TableHead key={`h-${rowIdx}-${colIdx}`} rowSpan={headerHeight - rowIdx} className="text-center text-xs" style={{ minWidth: `${columnMinWidthsCh[colIdx] ?? 12}ch` }}>{String(text ?? "").trim()}</TableHead>;
                          })}
                        </TableRow>
                      );
                    });
                  })()
                ) : (
                  <TableRow>
                    {headerKeys.map((key, i) => (
                      <TableHead key={key} className="text-xs" style={{ minWidth: `${columnMinWidthsCh[i] ?? 12}ch` }}>
                        {headerLabels[i] ?? key}
                      </TableHead>
                    ))}
                    {isEditing && <TableHead className="text-xs text-right w-24">Aksi</TableHead>}
                  </TableRow>
                )}
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const edits = editedRows[String(row.id)];
                  const rowToValidate = edits ? { ...row, ...edits } : row;
                  const status = hasRowError(rowToValidate) ? "error" : "valid";
                  return (
                    <TableRow
                      key={String(row.id)}
                      className={status === "error" ? "bg-red-50 hover:bg-red-100" : "hover:bg-muted/50"}
                    >
                      {headerKeys.map((k, colIdx) => {
                        const cellValue = row[k];
                        const editedValue = editedRows[String(row.id)]?.[k];
                        const valueToValidate = editedValue !== undefined ? editedValue : cellValue;
                        const cellError = getCellError({ ...row, [k]: valueToValidate }, k);
                        const isCellError = cellError !== null;
                        const isDateCol = isDateField(k);
                        const isGenderCol = k.toLowerCase() === "jk" || (k.toLowerCase().includes("jenis") && k.toLowerCase().includes("kelamin"));
                        let displayValue = editedValue ?? cellValue;
                        let displayText = displayValue;
                        if (isGenderCol) displayText = formatGenderDisplay(displayValue);
                        else if (!isEditing && isDateCol && displayValue !== null && displayValue !== "" && !isNaN(displayValue)) {
                          const numVal = Number(displayValue);
                          if (Number.isInteger(numVal) && numVal > 0) try { displayText = formatDateDDMMYYYY(excelSerialToDate(numVal)); } catch { displayText = String(displayValue); }
                        }
                        return (
                          <TableCell
                            key={k}
                            className={`text-sm relative ${isCellError ? "border-l-4 border-red-500 bg-red-50" : ""} ${isEditing ? "p-1" : ""}`}
                            title={cellError || ""}
                            style={{ minWidth: `${columnMinWidthsCh[colIdx] ?? 12}ch` }}
                          >
                            {isEditing ? (
                              (() => {
                                const lower = k.toLowerCase();
                                const isUmur = lower.includes("umur");
                                if (isDateCol) {
                                  let inputValue = "";
                                  const edited = editedRows[String(row.id)]?.[k];
                                  if (edited !== undefined) inputValue = String(edited);
                                  else if (cellValue !== null && cellValue !== "") {
                                    if (!isNaN(cellValue) && Number.isInteger(Number(cellValue)) && Number(cellValue) > 0) try { inputValue = formatDateDDMMYYYY(excelSerialToDate(Number(cellValue))); } catch { inputValue = String(cellValue); }
                                    else inputValue = String(cellValue);
                                  }
                                  return (
                                    <input
                                      type="text"
                                      placeholder="DD/MM/YYYY"
                                      className={`w-full border rounded px-2 py-1.5 text-sm ${isCellError ? "border-red-500 bg-red-100" : "border-primary/40"} focus:outline-none focus:ring-2 focus:ring-primary`}
                                      value={inputValue}
                                      onChange={(e) => handleCellChange(row.id, k, e.target.value)}
                                    />
                                  );
                                }
                                if (isUmur) {
                                  return (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      className={`w-full border rounded px-2 py-1.5 text-sm ${isCellError ? "border-red-500 bg-red-100" : "border-primary/40"} focus:outline-none focus:ring-2 focus:ring-primary`}
                                      value={String(displayValue ?? "")}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const num = Number(raw);
                                        handleCellChange(row.id, k, raw === "" ? null : Number.isFinite(num) && /^\d+$/.test(raw.trim()) ? num : raw);
                                      }}
                                    />
                                  );
                                }
                                return (
                                  <input
                                    className={`w-full border rounded px-2 py-1.5 text-sm ${isCellError ? "border-red-500 bg-red-100" : "border-primary/40"} focus:outline-none focus:ring-2 focus:ring-primary`}
                                    value={String(displayValue ?? "")}
                                    onChange={(e) => handleCellChange(row.id, k, e.target.value)}
                                  />
                                );
                              })()
                            ) : (
                              <div>
                                <div className={isCellError ? "text-red-600" : ""}>{String(displayText ?? "-")}</div>
                                {isCellError && <div className="text-xs text-red-600 mt-0.5 italic">{cellError}</div>}
                              </div>
                            )}
                          </TableCell>
                        );
                      })}
                      {isEditing && (
                        <TableCell className="text-right align-top w-24">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleRemoveRow(row.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Hapus
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                onClick={handleCancelImport}
                className={`gap-2 ${btnAnim}`}
              >
                <X className="w-4 h-4" />
                Batalkan Import
              </Button>
              <Button
                onClick={() => void handleConfirmImport()}
                disabled={loading || confirmDisabledReasons.length > 0}
                className={`gap-2 ${btnAnim}`}
              >
                {loading ? "Memproses..." : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Konfirmasi & Simpan Data
                  </>
                )}
              </Button>
            </div>

            {!loading && confirmDisabledReasons.length > 0 && (
              <div className="text-center">
                <p className="text-xs text-amber-700">Konfirmasi belum bisa dilakukan karena:</p>
                <p className="text-xs text-amber-700">{confirmDisabledReasons.join(" ")}</p>
              </div>
            )}

            {/* Messages */}
            {errorMsg && (
              <div className="flex items-start gap-2 justify-center text-destructive">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm font-medium">{errorMsg}</p>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2 justify-center text-primary">
                <CheckCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm font-medium">{successMsg}</p>
              </div>
            )}
            <p className="text-xs text-center text-muted-foreground">
              Data akan disimpan permanen setelah konfirmasi
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
