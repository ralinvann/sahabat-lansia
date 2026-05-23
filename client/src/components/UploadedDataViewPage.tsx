import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertCircle, CalendarClock, CheckCircle, Edit3, FileText, Loader, Save, Search, User, X, Download } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type UploadedDataViewPageProps = {
  reportId: string | null;
  onBack?: () => void;
};

type WorksheetData = {
  worksheetName?: string;
  puskesmas?: string;
  kabupaten?: string;
  bulanTahun?: string;
  metaPairs?: { key: string; value: string }[];
  headerKeys?: string[];
  headerLabels?: string[];
  headerOrder?: string[];
  rowData?: any[];
  sourceSheetName?: string;
  headerBlock?: { start: number; end: number; rows: any[][]; merges: any[] };
  rows?: any[];
  desa?: string;
};

type ReportDocument = {
  _id?: string;
  fileName?: string;
  kabupaten?: string;
  bulanTahun?: string;
  puskesmas?: string;
  desa?: string;
  metaPairs?: { key: string; value: string }[];
  headerKeys?: string[];
  headerLabels?: string[];
  headerOrder?: string[];
  rowData?: any[];
  sourceSheetName?: string;
  worksheets?: WorksheetData[];
  createdBy?: {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
  };
  submittedAt?: string;
  createdAt?: string;
};

const ALLOWED_ROLES = new Set(["ADMIN", "SUPERADMIN"]);
const btnAnim = "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]";

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
  return String(key)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
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
  const hasL = str.includes("l");
  const hasP = str.includes("p");
  if (hasL && !hasP) return "Laki-laki";
  if (hasP && !hasL) return "Perempuan";
  if (hasL && hasP) return "Ambigu";
  return "Tidak Valid";
}

function getReporterName(report?: ReportDocument | null): string {
  const user = report?.createdBy;
  if (!user) return "Tidak Diketahui";
  return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(" ").trim() || user.email || "Tidak Diketahui";
}

function getReportWorksheets(report: ReportDocument | null): WorksheetData[] {
  if (Array.isArray(report?.worksheets) && report.worksheets.length > 0) {
    return report.worksheets;
  }

  if (Array.isArray(report?.rowData) && report.rowData.length > 0) {
    return [
      {
        worksheetName: report?.sourceSheetName || "Sheet1",
        puskesmas: report?.puskesmas || "-",
        kabupaten: report?.kabupaten || "-",
        bulanTahun: report?.bulanTahun || "-",
        headerOrder: Array.isArray(report?.headerOrder)
          ? report.headerOrder
          : (Array.isArray(report?.headerKeys) ? report.headerKeys : []),
        headerKeys: Array.isArray(report?.headerKeys) ? report.headerKeys : [],
        headerLabels: Array.isArray(report?.headerLabels) ? report.headerLabels : [],
        rowData: report.rowData,
      },
    ];
  }

  return [];
}

function normalizeWorksheet(report: ReportDocument | null): WorksheetData | null {
  const worksheets = getReportWorksheets(report);
  if (worksheets.length > 0) return worksheets[0];
  return null;
}

function formatCellValue(headerKey: string, value: any): string {
  if (value === null || value === undefined || value === "") return "-";

  if (typeof value === "boolean") {
    return value ? "✓" : "";
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return "✓";
    if (normalized === "false") return "";
  }

  if (isDateField(headerKey)) {
    const numericValue = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(numericValue) && Number.isInteger(numericValue) && numericValue > 0) {
      try {
        return formatDateDDMMYYYY(excelSerialToDate(numericValue));
      } catch {
        return String(value);
      }
    }
  }

  return String(value);
}

export function UploadedDataViewPage({ reportId, onBack }: UploadedDataViewPageProps) {
  const { user, ready } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [report, setReport] = useState<ReportDocument | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedRows, setEditedRows] = useState<Record<string, Record<string, any>>>({});
  const [rowSearch, setRowSearch] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [editedDesa, setEditedDesa] = useState("");

  useEffect(() => {
    if (!reportId) {
      setReport(null);
      setError("Laporan tidak ditemukan.");
      return;
    }

    let cancelled = false;

    const fetchReport = async () => {
      setLoading(true);
      setError(null);
      setSaveError(null);
      try {
        const { data } = await api.get(`/elderly-reports/${reportId}`);
        if (cancelled) return;
        setReport(data?.item || null);
        setEditedDesa(String(data?.item?.desa ?? data?.item?.worksheets?.[0]?.desa ?? "").trim());
        setIsEditing(false);
        setEditedRows({});
        setRowSearch("");
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.response?.data?.message || "Gagal memuat detail data upload.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchReport();

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const activeWorksheet = useMemo(() => normalizeWorksheet(report), [report]);

  const rows = useMemo(() => {
    if (!activeWorksheet) return [];
    return (activeWorksheet.rowData || []).map((row: any, index: number) => ({
      ...row,
      id: row?.id ?? row?._id ?? `row_${index + 1}`,
    }));
  }, [activeWorksheet]);

  const headerKeys = useMemo(() => {
    if (!activeWorksheet) return [] as string[];
    if (Array.isArray(activeWorksheet.headerOrder) && activeWorksheet.headerOrder.length > 0) return activeWorksheet.headerOrder;
    if (Array.isArray(activeWorksheet.headerKeys) && activeWorksheet.headerKeys.length > 0) return activeWorksheet.headerKeys;
    if (rows.length > 0) return Object.keys(rows[0]).filter((key) => key !== "id");
    return [] as string[];
  }, [activeWorksheet, rows]);

  const headerLabelsMap = useMemo(() => {
    const labels = Array.isArray(activeWorksheet?.headerLabels) ? activeWorksheet.headerLabels : [];
    const map: Record<string, string> = {};
    headerKeys.forEach((key, index) => {
      map[key] = labels[index] || key;
    });
    return map;
  }, [activeWorksheet, headerKeys]);

  const displayRows = useMemo(() => {
    if (!rowSearch) return rows;
    const s = rowSearch.toLowerCase();
    return rows.filter((row) =>
      headerKeys.some((key) => String(row?.[key] ?? "").toLowerCase().includes(s))
    );
  }, [rows, rowSearch, headerKeys]);

  const columnMinWidthsCh = useMemo(() => {
    return headerKeys.map((key, index) => {
      const headerLen = String(headerLabelsMap[key] ?? key ?? "").trim().length;
      let longestValueLen = 0;
      for (const row of rows) {
        const value = editedRows[String(row.id)]?.[key] ?? row[key];
        longestValueLen = Math.max(longestValueLen, String(value ?? "").trim().length);
      }
      return Math.max(12, Math.min(48, Math.max(headerLen, longestValueLen) + 2));
    });
  }, [headerKeys, headerLabelsMap, rows, editedRows]);

  const getCellError = (row: any, key: string): string | null => {
    const lowerKey = key.toLowerCase();
    const cellValue = row[key];

    if ((lowerKey === "nama" || lowerKey.includes("nama")) && (!cellValue || !String(cellValue).trim())) {
      return "Nama wajib diisi";
    }

    if (isNikField(key)) {
      if (!cellValue || !String(cellValue).trim()) return "NIK wajib diisi";
      const nikNum = Number(String(cellValue).trim());
      if (Number.isNaN(nikNum) || !Number.isInteger(nikNum) || nikNum <= 0) return "NIK harus angka bulat positif";
      const nikCount = rows.filter((r) => {
        const rnik = editedRows[String(r.id)]?.[key] ?? r[key];
        return rnik && Number(rnik) === nikNum;
      }).length;
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
      if (typeof cellValue === "string") {
        if (!parseDateDDMMYYYY(cellValue.trim())) return "Format tanggal: DD/MM/YYYY";
      } else {
        const n = Number(cellValue);
        if (Number.isNaN(n) || !Number.isInteger(n) || n < 0 || n > 100000) return "Tanggal tidak valid";
      }
    }

    return null;
  }

  const hasRowError = (row: any): boolean => {
    return headerKeys.some((key) => getCellError(row, key) !== null);
  };

  const validationResults = useMemo(() => {
    if (!rows.length) return { total: 0, valid: 0, warning: 0, error: 0 };

    let valid = 0;
    let errorCount = 0;
    rows.forEach((row) => {
      const edits = editedRows[String(row.id)];
      const nextRow = edits ? { ...row, ...edits } : row;
      if (hasRowError(nextRow)) errorCount += 1;
      else valid += 1;
    });
    return { total: rows.length, valid, warning: 0, error: errorCount };
  }, [rows, editedRows, headerKeys]);

  const handleCellChange = (rowId: string | number, key: string, value: any) => {
    setEditedRows((prev) => ({
      ...prev,
      [String(rowId)]: {
        ...(prev[String(rowId)] || {}),
        [key]: value,
      },
    }));
  };

  const handleEditToggle = () => {
    setSaveError(null);
    setSaveSuccess(null);
    if (isEditing) {
      setEditedRows({});
      setEditedDesa(String(report?.desa ?? activeWorksheet?.desa ?? "").trim());
      setIsEditing(false);
      return;
    }
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedRows({});
    setEditedDesa(String(report?.desa ?? activeWorksheet?.desa ?? "").trim());
    setIsEditing(false);
    setSaveError(null);
  };

  const handleSaveChanges = async () => {
    if (!report || !activeWorksheet) return;
    if (validationResults.error > 0) {
      setSaveError("Perbaiki error sebelum menyimpan perubahan.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const updatedRows = rows.map((row) => {
        const edits = editedRows[String(row.id)];
        if (!edits) return row;
        const nextRow: Record<string, any> = { ...row };
        Object.entries(edits).forEach(([key, value]) => {
          if (isDateField(key) && value !== null && value !== "") {
            const parsed = parseDateDDMMYYYY(String(value).trim());
            nextRow[key] = parsed ? dateToExcelSerial(parsed) : value;
          } else {
            nextRow[key] = value;
          }
        });
        return nextRow;
      });

      const payloadWorksheet: WorksheetData = {
        ...activeWorksheet,
        rowData: updatedRows,
        desa: editedDesa.trim(),
        headerKeys: activeWorksheet.headerKeys ?? headerKeys,
        headerLabels: activeWorksheet.headerLabels ?? headerKeys.map((key) => key.toUpperCase()),
        headerOrder: activeWorksheet.headerOrder ?? headerKeys,
      };

      const body = {
        kabupaten: report.kabupaten ?? payloadWorksheet.kabupaten ?? "",
        bulanTahun: report.bulanTahun ?? payloadWorksheet.bulanTahun ?? "",
        fileName: report.fileName,
        puskesmas: payloadWorksheet.puskesmas ?? report.puskesmas ?? "",
        desa: editedDesa.trim() || payloadWorksheet.desa || report.desa || "",
        metaPairs: payloadWorksheet.metaPairs ?? report.metaPairs ?? [],
        headerKeys: payloadWorksheet.headerKeys ?? headerKeys,
        headerLabels: payloadWorksheet.headerLabels ?? headerKeys.map((key) => key.toUpperCase()),
        headerOrder: payloadWorksheet.headerOrder ?? headerKeys,
        rowData: updatedRows,
        sourceSheetName: payloadWorksheet.sourceSheetName ?? report.sourceSheetName,
        worksheets: [{ ...payloadWorksheet, rowData: updatedRows }],
      };

      const { data } = await api.put(`/elderly-reports/${reportId}`, body);
      const nextReport = data?.report || null;
      setReport(nextReport || {
        ...report,
        ...body,
        worksheets: [{ ...payloadWorksheet, rowData: updatedRows }],
      });
      setEditedRows({});
      setIsEditing(false);
      setSaveSuccess("Perubahan berhasil disimpan.");
      setTimeout(() => setSaveSuccess(null), 1600);
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || err?.message || "Gagal menyimpan perubahan.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!reportId) return;
    try {
      setDownloading(true);
      const response = await api.get(`/elderly-reports/${reportId}/download`, {
        responseType: "blob",
      });

      const contentDisposition = String(response.headers?.["content-disposition"] || "");
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const uploadedFileName = String(report?.fileName || "Laporan_Bulanan.xlsx").trim();
      const dotIdx = uploadedFileName.lastIndexOf(".");
      const baseName = dotIdx > 0 ? uploadedFileName.slice(0, dotIdx) : uploadedFileName;
      const uploader = report?.createdBy
        ? [report.createdBy.firstName, report.createdBy.middleName, report.createdBy.lastName].filter(Boolean).join(" ").trim() || report.createdBy.email || "Unknown"
        : "Unknown";
      const uploadedAt = new Date(report?.submittedAt || report?.createdAt || Date.now());
      const timestamp = Number.isNaN(uploadedAt.getTime())
        ? String(Date.now())
        : [
            uploadedAt.getFullYear(),
            String(uploadedAt.getMonth() + 1).padStart(2, "0"),
            String(uploadedAt.getDate()).padStart(2, "0"),
            String(uploadedAt.getHours()).padStart(2, "0"),
            String(uploadedAt.getMinutes()).padStart(2, "0"),
            String(uploadedAt.getSeconds()).padStart(2, "0"),
          ].join("");
      const sanitizePart = (value: string) => value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").trim() || "Unknown";
      const fallback = `${sanitizePart(baseName)}_${sanitizePart(String(uploader))}_${timestamp}.xlsx`;
      const filename = match?.[1] || fallback;

      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || err?.message || "Gagal mengunduh laporan.");
    } finally {
      setDownloading(false);
    }
  };

  const reporterName = getReporterName(report);
  const uploadedAt = report?.submittedAt || report?.createdAt;

  const authDenied = ready && (!user || !ALLOWED_ROLES.has(String(user.role || "").toUpperCase()));

  if (!ready) {
    return <div className="p-6 text-sm text-muted-foreground">Memuat data...</div>;
  }

  if (authDenied) {
    return (
      <div className="p-6">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Akses Ditolak</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">Anda tidak memiliki izin untuk halaman ini.</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Lihat Data Upload</h2>
          <p className="text-sm text-muted-foreground mt-1">Halaman ini hanya untuk admin/superadmin.</p>
        </div>
        <Button className={`gap-2 ${btnAnim}`} onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
          Kembali
        </Button>
      </div>

      {loading ? (
        <Card className="shadow-sm">
          <CardContent className="py-10 flex items-center justify-center text-sm text-muted-foreground">
            <Loader className="w-4 h-4 animate-spin mr-2" /> Memuat data laporan...
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="shadow-sm">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : !report || !activeWorksheet ? (
        <Card className="shadow-sm">
          <CardContent className="py-4 text-sm text-muted-foreground">Data laporan tidak tersedia.</CardContent>
        </Card>
      ) : (
        <>
          <Card className="shadow-sm">
            <CardContent className="py-4 space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm flex-1">
                  <div><span className="text-muted-foreground">File:</span> {report.fileName || "-"}</div>
                  <div><span className="text-muted-foreground">Bulan/Tahun:</span> {report.bulanTahun || "-"}</div>
                  <div><span className="text-muted-foreground">Kabupaten:</span> {String(report.kabupaten || "-").replace(/^:\s*/, "")}</div>
                  <div><span className="text-muted-foreground">Puskesmas:</span> {String(activeWorksheet.puskesmas || report.puskesmas || "-").replace(/^:\s*/, "")}</div>
                  <div>
                    <span className="text-muted-foreground">Desa:</span>{" "}
                    {isEditing ? (
                      <Input
                        className="mt-1 h-8 w-full max-w-[260px]"
                        value={editedDesa}
                        onChange={(e) => setEditedDesa(e.target.value)}
                        placeholder="Masukkan desa"
                      />
                    ) : (
                      <span>{String(report.desa || activeWorksheet.desa || "-").replace(/^:\s*/, "")}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2"><User className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Diunggah oleh:</span> <span>{reporterName}</span></div>
                  <div className="flex items-center gap-2"><CalendarClock className="w-4 h-4 text-muted-foreground" /><span className="text-muted-foreground">Waktu upload:</span> <span>{uploadedAt ? new Date(uploadedAt).toLocaleString("id-ID") : "-"}</span></div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => void handleDownloadReport()} disabled={downloading} className={`gap-2 ${btnAnim}`}>
                    {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {downloading ? "Mengunduh..." : "Unduh File"}
                  </Button>
                  <Button variant="outline" onClick={handleEditToggle} className={`gap-2 ${btnAnim}`}>
                    <Edit3 className="w-4 h-4" />
                    {isEditing ? "Batalkan" : "Edit Data"}
                  </Button>
                  {isEditing && (
                    <Button onClick={() => void handleSaveChanges()} disabled={saving || validationResults.error > 0} className={`gap-2 ${btnAnim}`}>
                      <Save className="w-4 h-4" />
                      {saving ? "Menyimpan..." : "Simpan Perubahan"}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 items-center justify-between border-t pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm w-full lg:w-auto">
                  <div className="p-3 rounded-lg bg-muted/30 border">
                    <div className="text-muted-foreground text-xs">Total Baris</div>
                    <div className="font-semibold">{rows.length}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <div className="text-muted-foreground text-xs">Valid</div>
                    <div className="font-semibold text-primary">{validationResults.valid}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                    <div className="text-muted-foreground text-xs">Kesalahan</div>
                    <div className="font-semibold text-red-600">{validationResults.error}</div>
                  </div>
                </div>

                <div className="relative w-full lg:w-80">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Cari pada data..."
                    className="pl-9 h-9"
                    value={rowSearch}
                    onChange={(e) => setRowSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {(saveError || saveSuccess) && (
            <Card className="shadow-sm">
              <CardContent className="py-4">
                {saveError && (
                  <div className="flex items-start gap-2 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{saveError}</span>
                  </div>
                )}
                {saveSuccess && (
                  <div className="flex items-start gap-2 text-primary text-sm">
                    <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{saveSuccess}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                {isEditing ? "Edit Data Kesehatan" : "Preview Data Kesehatan"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headerKeys.map((key, index) => (
                        <TableHead key={key} className="text-xs" style={{ minWidth: `${columnMinWidthsCh[index] ?? 12}ch` }}>
                          {headerLabelsMap[key] || key}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={Math.max(headerKeys.length, 1)} className="text-center py-8 text-sm text-muted-foreground">
                          Tidak ada data sesuai pencarian.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayRows.map((row) => {
                        const edits = editedRows[String(row.id)];
                        const rowToValidate = edits ? { ...row, ...edits } : row;
                        const hasErrorRow = hasRowError(rowToValidate);
                        return (
                          <TableRow
                            key={String(row.id)}
                            className={hasErrorRow ? "bg-red-50 hover:bg-red-100" : "hover:bg-muted/50"}
                          >
                            {headerKeys.map((key, colIdx) => {
                              const cellValue = row[key];
                              const editedValue = editedRows[String(row.id)]?.[key];
                              const valueToValidate = editedValue !== undefined ? editedValue : cellValue;
                              const cellError = getCellError({ ...row, [key]: valueToValidate }, key);
                              const isCellError = cellError !== null;
                              const isDateCol = isDateField(key);
                              const isGenderCol = key.toLowerCase() === "jk" || (key.toLowerCase().includes("jenis") && key.toLowerCase().includes("kelamin"));
                              let displayValue = editedValue ?? cellValue;
                              let displayText = displayValue;

                              if (isGenderCol) displayText = formatGenderDisplay(displayValue);
                              else if (!isEditing && isDateCol && displayValue !== null && displayValue !== "" && !isNaN(displayValue)) {
                                const numVal = Number(displayValue);
                                if (Number.isInteger(numVal) && numVal > 0) {
                                  try {
                                    displayText = formatDateDDMMYYYY(excelSerialToDate(numVal));
                                  } catch {
                                    displayText = String(displayValue);
                                  }
                                }
                              } else if (!isEditing) {
                                displayText = formatCellValue(key, displayValue);
                              }

                              return (
                                <TableCell
                                  key={key}
                                  className={`text-sm relative ${isCellError ? "border-l-4 border-red-500 bg-red-50" : ""} ${isEditing ? "p-1" : ""}`}
                                  title={cellError || ""}
                                  style={{ minWidth: `${columnMinWidthsCh[colIdx] ?? 12}ch` }}
                                >
                                  {isEditing ? (
                                    (() => {
                                      const lower = key.toLowerCase();
                                      const isUmur = lower.includes("umur");
                                      if (isDateCol) {
                                        let inputValue = "";
                                        const edited = editedRows[String(row.id)]?.[key];
                                        if (edited !== undefined) inputValue = String(edited);
                                        else if (cellValue !== null && cellValue !== "") {
                                          if (!isNaN(cellValue) && Number.isInteger(Number(cellValue)) && Number(cellValue) > 0) {
                                            try {
                                              inputValue = formatDateDDMMYYYY(excelSerialToDate(Number(cellValue)));
                                            } catch {
                                              inputValue = String(cellValue);
                                            }
                                          } else {
                                            inputValue = String(cellValue);
                                          }
                                        }
                                        return (
                                          <input
                                            type="text"
                                            placeholder="DD/MM/YYYY"
                                            className={`w-full border rounded px-2 py-1.5 text-sm ${isCellError ? "border-red-500 bg-red-100" : "border-primary/40"} focus:outline-none focus:ring-2 focus:ring-primary`}
                                            value={inputValue}
                                            onChange={(e) => handleCellChange(row.id, key, e.target.value)}
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
                                              handleCellChange(row.id, key, raw === "" ? null : Number.isFinite(num) && /^\d+$/.test(raw.trim()) ? num : raw);
                                            }}
                                          />
                                        );
                                      }
                                      return (
                                        <input
                                          className={`w-full border rounded px-2 py-1.5 text-sm ${isCellError ? "border-red-500 bg-red-100" : "border-primary/40"} focus:outline-none focus:ring-2 focus:ring-primary`}
                                          value={String(displayValue ?? "")}
                                          onChange={(e) => handleCellChange(row.id, key, e.target.value)}
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
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {isEditing ? (
            <Card className="shadow-sm">
              <CardContent className="pt-6">
                <div className="flex justify-center">
                  <Button variant="outline" onClick={handleCancelEdit} className={`gap-2 ${btnAnim}`}>
                    <X className="w-4 h-4" />
                    Batalkan Edit
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
