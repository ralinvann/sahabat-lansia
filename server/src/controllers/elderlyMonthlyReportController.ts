// controllers/elderlyMonthlyReportController.ts
import { Request, Response } from "express";
import { ElderlyMonthlyReport } from "../models/ElderlyMonthlyReport";
import { ElderlyPerson } from "../models/ElderlyPerson";
import {
  generateAnnualReportA,
  findMonthIndex,
  type MonthSheet,
} from "../utils/generateAnnualReportA";
import {
  generateAnnualReportB,
  type MonthSheetB,
} from "../utils/generateAnnualReportB";
import { logActivity } from "../utils/activityLogger";
import { recomputeWorkerTrackingStats } from "../utils/workerTrackingStats";

type IndividualRecord = Record<string, any>;

const YES_VALUES = new Set(["yes", "ya", "v", "✓", "x", "1", "true"]);

function normalizeLookupKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findValue(record: IndividualRecord, predicates: Array<(key: string) => boolean>): any {
  for (const key of Object.keys(record)) {
    const normalizedKey = normalizeLookupKey(key);
    if (predicates.some((predicate) => predicate(normalizedKey))) {
      return record[key];
    }
  }
  return undefined;
}

function parseBooleanFlag(value: any): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (value === null || value === undefined) return false;
  const normalized = String(value).trim().toLowerCase();
  return YES_VALUES.has(normalized);
}

function isPresenceBasedServiceKey(normalizedKey: string): boolean {
  if (
    normalizedKey.includes("skrining") ||
    normalizedKey.includes("pengobatan") ||
    normalizedKey.includes("penyuluhan") ||
    normalizedKey.includes("pemberdayaan")
  ) {
    return true;
  }

  // Tingkat kemandirian columns are commonly represented as A/B/C (and may be suffixed e.g. A_2)
  return /^[abc]\d*$/.test(normalizedKey);
}

function parsePresenceFlag(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  // Numbers/booleans/other values are considered filled when present.
  return true;
}

function normalizeServicePresenceRow(record: IndividualRecord): IndividualRecord {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }

  const normalizedRecord: IndividualRecord = { ...record };

  for (const key of Object.keys(normalizedRecord)) {
    const normalizedKey = normalizeLookupKey(key);
    if (!isPresenceBasedServiceKey(normalizedKey)) continue;
    normalizedRecord[key] = parsePresenceFlag(normalizedRecord[key]);
  }

  return normalizedRecord;
}

function normalizeServicePresenceRows(rowData: any[]): IndividualRecord[] {
  if (!Array.isArray(rowData)) return [];

  return rowData.map((row) =>
    row && typeof row === "object" && !Array.isArray(row)
      ? normalizeServicePresenceRow(row as IndividualRecord)
      : row
  );
}

function parseAge(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const normalized = trimmed.replace(/,/g, ".");
    const directNumeric = Number(normalized);
    if (Number.isFinite(directNumeric)) {
      return directNumeric >= 0 ? Math.floor(directNumeric) : null;
    }

    const extracted = normalized.match(/\d+/);
    if (extracted) {
      const parsed = Number(extracted[0]);
      return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
    }

    return null;
  }

  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue >= 0 ? Math.floor(numericValue) : null;
  }
  return null;
}

function parseDateString(value: string): Date | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const ddmmyyyy = normalized.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (ddmmyyyy) {
    const day = Number(ddmmyyyy[1]);
    const month = Number(ddmmyyyy[2]);
    const year = Number(ddmmyyyy[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  const yyyymmdd = normalized.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (yyyymmdd) {
    const year = Number(yyyymmdd[1]);
    const month = Number(yyyymmdd[2]);
    const day = Number(yyyymmdd[3]);
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  const nativeParsed = new Date(normalized);
  if (!Number.isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  return null;
}

function parseBirthDateToAge(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;

  let birthDate: Date | null = null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(1899, 11, 30);
    birthDate = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
  } else if (typeof value === "string") {
    birthDate = parseDateString(value);
  }

  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function normalizeGender(value: any): "L" | "P" | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === "L" || normalized === "LAKI-LAKI" || normalized.startsWith("L")) return "L";
  if (normalized === "P" || normalized === "PEREMPUAN" || normalized.startsWith("P")) return "P";
  return null;
}

function normalizeIndependenceLevel(record: IndividualRecord): "A" | "B" | "C" | null {
  const levelValue = findValue(record, [
    (key) => key === "independencelevel",
    (key) => key === "tingkatkemandirian",
    (key) => key.includes("independence") && key.includes("level"),
    (key) => key.includes("tingkat") && key.includes("kemandirian"),
  ]);

  if (levelValue !== undefined && levelValue !== null && String(levelValue).trim() !== "") {
    const normalizedLevel = String(levelValue).trim().toUpperCase();
    if (["A", "B", "C"].includes(normalizedLevel)) {
      return normalizedLevel as "A" | "B" | "C";
    }
  }

  const levelAValue = findValue(record, [(key) => key === "a"]);
  const levelBValue = findValue(record, [(key) => key === "b"]);
  const levelCValue = findValue(record, [(key) => key === "c"]);

  if (parseBooleanFlag(levelAValue)) return "A";
  if (parseBooleanFlag(levelBValue)) return "B";
  if (parseBooleanFlag(levelCValue)) return "C";

  return null;
}

async function upsertPersonsFromReport(doc: any): Promise<void> {
  const allRows = extractRows(doc);
  if (!allRows || allRows.length === 0) return;

  const kabupaten = String(doc.kabupaten ?? "").trim();
  const bulanTahun = String(doc.bulanTahun ?? "").trim();

  // Build a quick lookup for worksheet metadata by rowData reference if possible
  const worksheetMeta: Array<{ rows: IndividualRecord[]; puskesmas?: string; worksheetName?: string }> = [];
  if (Array.isArray(doc.worksheets)) {
    for (const ws of doc.worksheets) {
      if (Array.isArray(ws.rowData)) {
        worksheetMeta.push({
          rows: ws.rowData,
          puskesmas: ws.puskesmas,
          worksheetName: ws.worksheetName,
        });
      }
    }
  }

  for (const record of allRows) {
    const nikValue = findValue(record, [
      (key) => key === "nik",
      (key) => key.includes("nik"),
      (key) => key.includes("noktp"),
      (key) => key.includes("ktp"),
    ]);
    const nik = String(nikValue ?? "").trim();
    if (!nik) continue;

    const ageValue = findValue(record, [
      (key) => key === "age",
      (key) => key === "umur",
      (key) => key === "usia",
      (key) => key.includes("umur"),
      (key) => key.includes("usia"),
    ]);
    let age = parseAge(ageValue);
    if (age === null) {
      const birthDateValue = findValue(record, [
        (key) => key === "birthdate",
        (key) => key === "tanggallahir",
        (key) => key === "tgllahir",
        (key) => key.includes("tanggal") && key.includes("lahir"),
        (key) => key.includes("lahir"),
        (key) => key.includes("birth") && key.includes("date"),
      ]);
      age = parseBirthDateToAge(birthDateValue);
    }

    const genderValue = findValue(record, [
      (key) => key === "jk",
      (key) => key === "gender",
      (key) => key === "jeniskelamin",
      (key) => key.includes("jenis") && key.includes("kelamin"),
    ]);
    const gender = normalizeGender(genderValue) ?? undefined;

    const nameValue = findValue(record, [
      (key) => key === "nama",
      (key) => key.includes("nama"),
      (key) => key.includes("name"),
    ]);
    const name = String(nameValue ?? "").trim() || undefined;

    const puskesmasValue = findValue(record, [
      (key) => key.includes("puskesmas"),
    ]);
    const puskesmas = String(puskesmasValue ?? doc.puskesmas ?? "").trim() || undefined;

    const dataFlagValue = findValue(record, [
      (key) => key === "data",
      (key) => key === "d_a_t_a",
      (key) => key.includes("data"),
    ]);
    const screenedValue = findValue(record, [
      (key) => key === "screening",
      (key) => key.includes("skrining"),
    ]);
    const empowermentValue = findValue(record, [
      (key) => key === "empowerment",
      (key) => key.includes("pemberdayaan"),
    ]);

    const flags = {
      data: parseBooleanFlag(dataFlagValue),
      screened: parseBooleanFlag(screenedValue),
      empowered: parseBooleanFlag(empowermentValue),
    };

    // Try to locate worksheet/source info for this record (best-effort only)
    let sourceWorksheetName: string | undefined;
    let sourcePuskesmas: string | undefined = puskesmas;
    let rowIndex: number | undefined;
    outer: for (const meta of worksheetMeta) {
      const idx = meta.rows.indexOf(record as any);
      if (idx >= 0) {
        rowIndex = idx;
        sourceWorksheetName = meta.worksheetName;
        if (!sourcePuskesmas && meta.puskesmas) sourcePuskesmas = meta.puskesmas;
        break outer;
      }
    }

    await ElderlyPerson.findOneAndUpdate(
      { nik },
      {
        $set: {
          nik,
          name,
          gender,
          age: typeof age === "number" ? age : undefined,
          kabupaten,
          puskesmas: sourcePuskesmas,
          flags,
          lastReport: doc._id,
          lastBulanTahun: bulanTahun,
        },
        $setOnInsert: {},
        $addToSet: {
          sources: {
            report: doc._id,
            bulanTahun,
            worksheetName: sourceWorksheetName,
            rowIndex,
          },
        },
      },
      { upsert: true, new: false }
    );
  }
}

function extractRows(doc: any): IndividualRecord[] {
  const rows: IndividualRecord[] = [];

  if (Array.isArray(doc?.rowData)) {
    for (const row of doc.rowData) {
      if (row && typeof row === "object" && !Array.isArray(row)) {
        rows.push(row as IndividualRecord);
      }
    }
  }

  if (Array.isArray(doc?.worksheets)) {
    for (const worksheet of doc.worksheets) {
      if (!Array.isArray(worksheet?.rowData)) continue;
      for (const row of worksheet.rowData) {
        if (row && typeof row === "object" && !Array.isArray(row)) {
          rows.push(row as IndividualRecord);
        }
      }
    }
  }

  return rows;
}

function isNonEmptyString(v: any) {
  return typeof v === "string" && v.trim().length > 0;
}

export const createElderlyMonthlyReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const worksheetsInput = Array.isArray(req.body?.worksheets)
      ? req.body.worksheets
      : null;

    if (worksheetsInput && worksheetsInput.length > 0) {
      const topKabupaten = String(req.body?.kabupaten ?? "").trim();
      const topBulanTahun = String(req.body?.bulanTahun ?? "").trim();

      const normalizedWorksheets = worksheetsInput
        .map((ws: any, index: number) => {
          const headerKeys = Array.isArray(ws?.headerKeys)
            ? ws.headerKeys
            : Array.isArray(ws?.headerOrder)
            ? ws.headerOrder
            : [];

          const headerOrder = Array.isArray(ws?.headerOrder)
            ? ws.headerOrder
            : headerKeys;

          const headerLabels = Array.isArray(ws?.headerLabels)
            ? ws.headerLabels
            : headerKeys.map((k: string) => String(k).toUpperCase());

          const rowData = Array.isArray(ws?.rowData)
            ? normalizeServicePresenceRows(ws.rowData)
            : [];

          const mergeRanges = Array.isArray(ws?.mergeRanges) && ws.mergeRanges.length > 0
            ? ws.mergeRanges
            : ["A1:C1"];

          return {
            worksheetName:
              String(ws?.worksheetName ?? `Sheet${index + 1}`).trim() ||
              `Sheet${index + 1}`,
            puskesmas:
              String(ws?.puskesmas ?? req.body?.puskesmas ?? "-").trim() || "-",
            desa: String(ws?.desa ?? req.body?.desa ?? "").trim(),
            kabupaten: String(ws?.kabupaten ?? topKabupaten).trim(),
            bulanTahun: String(ws?.bulanTahun ?? topBulanTahun).trim(),
            metaPairs: Array.isArray(ws?.metaPairs) ? ws.metaPairs : [],
            headerKeys,
            headerLabels,
            headerOrder,
            rowData,
            sourceSheetName: ws?.sourceSheetName,
            headerBlock: ws?.headerBlock,
            mergeRanges,
          };
        })
        .filter((ws: any) => ws.headerKeys.length > 0 && ws.rowData.length > 0);

      if (normalizedWorksheets.length === 0) {
        res.status(400).json({ message: "worksheets tidak valid atau kosong." });
        return;
      }

      const docKabupaten =
        topKabupaten || String(normalizedWorksheets[0]?.kabupaten ?? "").trim();
      const docBulanTahun =
        topBulanTahun || String(normalizedWorksheets[0]?.bulanTahun ?? "").trim();

      if (!isNonEmptyString(docKabupaten) || !isNonEmptyString(docBulanTahun)) {
        res.status(400).json({
          message: "kabupaten dan bulanTahun wajib pada payload worksheets.",
        });
        return;
      }

      const firstWs = normalizedWorksheets[0];

      const doc = await ElderlyMonthlyReport.create({
        kabupaten: docKabupaten,
        bulanTahun: docBulanTahun,
        worksheets: normalizedWorksheets,
        puskesmas: firstWs.puskesmas,
        desa: firstWs.desa,
        metaPairs: firstWs.metaPairs,
        headerKeys: firstWs.headerKeys,
        headerLabels: firstWs.headerLabels,
        headerOrder: firstWs.headerOrder,
        rowData: firstWs.rowData,
        fileName: req.body?.fileName,
        sourceSheetName: firstWs.sourceSheetName,
        mergeRanges: firstWs.mergeRanges,
        status: "imported",
        createdBy: req.user?.id || undefined,
      });

      await upsertPersonsFromReport(doc);
      await recomputeWorkerTrackingStats(req.user?.id);

      await logActivity({
        userId: req.user?.id,
        action: "file_upload",
        details: "Mengunggah file laporan bulanan",
        metadata: {
          reportId: String(doc._id),
          fileName: req.body?.fileName || null,
          bulanTahun: docBulanTahun,
          kabupaten: docKabupaten,
        },
      });

      res.status(201).json({ message: "Saved", reportId: doc._id, report: doc });
      return;
    }

    const {
      kabupaten,
      puskesmas,
      desa,
      bulanTahun,
      metaPairs,
      headerKeys,
      headerLabels,
      headerOrder,
      rowData,
      fileName,
      sourceSheetName,
    } = req.body ?? {};

    if (
      !isNonEmptyString(kabupaten) ||
      !isNonEmptyString(puskesmas) ||
      !isNonEmptyString(bulanTahun)
    ) {
      res
        .status(400)
        .json({ message: "kabupaten, puskesmas, bulanTahun wajib." });
      return;
    }

    if (!Array.isArray(headerKeys) || headerKeys.length === 0) {
      res
        .status(400)
        .json({ message: "headerKeys wajib dan tidak boleh kosong." });
      return;
    }

    if (!Array.isArray(rowData) || rowData.length === 0) {
      res
        .status(400)
        .json({ message: "rowData kosong. Tidak ada data untuk disimpan." });
      return;
    }

    const normalizedRowData = normalizeServicePresenceRows(rowData);

    const mergeRanges = ["A1:C1"];

    const doc = await ElderlyMonthlyReport.create({
      kabupaten: kabupaten.trim(),
      bulanTahun: bulanTahun.trim(),
      worksheets: [
        {
          worksheetName: sourceSheetName?.trim() || "Sheet1",
          puskesmas: puskesmas.trim(),
          desa: String(desa ?? "").trim(),
          kabupaten: kabupaten.trim(),
          bulanTahun: bulanTahun.trim(),
          metaPairs: Array.isArray(metaPairs) ? metaPairs : [],
          headerKeys,
          headerLabels: Array.isArray(headerLabels)
            ? headerLabels
            : headerKeys.map((k: string) => String(k).toUpperCase()),
          headerOrder: Array.isArray(headerOrder) ? headerOrder : headerKeys,
          rowData: normalizedRowData,
          sourceSheetName,
          mergeRanges,
        },
      ],
      puskesmas: puskesmas.trim(),
      desa: String(desa ?? "").trim(),
      metaPairs: Array.isArray(metaPairs) ? metaPairs : [],
      headerKeys,
      headerLabels: Array.isArray(headerLabels)
        ? headerLabels
        : headerKeys.map((k: string) => String(k).toUpperCase()),
      headerOrder: Array.isArray(headerOrder) ? headerOrder : headerKeys,
      rowData: normalizedRowData,
      fileName,
      sourceSheetName,
      mergeRanges,
      status: "imported",
      createdBy: req.user?.id || undefined,
    });

    await upsertPersonsFromReport(doc);
    await recomputeWorkerTrackingStats(req.user?.id);

    await logActivity({
      userId: req.user?.id,
      action: "file_upload",
      details: "Mengunggah file laporan bulanan",
      metadata: {
        reportId: String(doc._id),
        fileName: fileName || null,
        bulanTahun: bulanTahun?.trim?.() || null,
        kabupaten: kabupaten?.trim?.() || null,
      },
    });

    res.status(201).json({ message: "Saved", reportId: doc._id, report: doc });
  } catch (e) {
    console.error("createElderlyMonthlyReport error:", e);
    res.status(500).json({ message: "Server error saving report." });
  }
};

export const getElderlyMonthlyReports = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const docs = await ElderlyMonthlyReport.find()
      .sort({ createdAt: -1 })
      .populate("createdBy", "firstName middleName lastName email")
      .lean();
    res.json({ items: docs });
  } catch (e) {
    console.error("getElderlyMonthlyReports error:", e);
    res.status(500).json({ message: "Server error." });
  }
};

export const getElderlyMonthlyReportById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const doc = await ElderlyMonthlyReport.findById(id).populate("createdBy", "firstName middleName lastName email");

    if (!doc) {
      res.status(404).json({ message: "Not found." });
      return;
    }

    res.json({ item: doc });
  } catch (e) {
    console.error("getElderlyMonthlyReportById error:", e);
    res.status(500).json({ message: "Server error." });
  }
};

export const updateElderlyMonthlyReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const existingReport = await ElderlyMonthlyReport.findById(id);

    if (!existingReport) {
      res.status(404).json({ message: "Not found." });
      return;
    }

    const updatedReport = await ElderlyMonthlyReport.findByIdAndUpdate(
      id,
      {
        $set: {
          kabupaten: req.body?.kabupaten,
          bulanTahun: req.body?.bulanTahun,
          worksheets: req.body?.worksheets,
          puskesmas: req.body?.puskesmas,
          desa: req.body?.desa,
          metaPairs: req.body?.metaPairs,
          headerKeys: req.body?.headerKeys,
          headerLabels: req.body?.headerLabels,
          headerOrder: req.body?.headerOrder,
          rowData: req.body?.rowData,
          fileName: req.body?.fileName,
          sourceSheetName: req.body?.sourceSheetName,
          status: req.body?.status || existingReport.status || "imported",
        },
      },
      { new: true, runValidators: true }
    ).populate("createdBy", "firstName middleName lastName email");

    if (!updatedReport) {
      res.status(404).json({ message: "Not found." });
      return;
    }

    const reportObjectId = existingReport._id;

    await ElderlyPerson.updateMany(
      { "sources.report": reportObjectId },
      { $pull: { sources: { report: reportObjectId } } }
    );
    await ElderlyPerson.deleteMany({ sources: { $size: 0 } });
    await ElderlyPerson.updateMany(
      { lastReport: reportObjectId },
      { $unset: { lastReport: "", lastBulanTahun: "" } }
    );

    await upsertPersonsFromReport(updatedReport);
    const statsOwnerId = String((updatedReport as any)?.createdBy?._id ?? (updatedReport as any)?.createdBy ?? existingReport.createdBy ?? "").trim();
    await recomputeWorkerTrackingStats(statsOwnerId || req.user?.id);

    await logActivity({
      userId: req.user?.id,
      action: "file_update",
      details: "Memperbarui file laporan bulanan",
      metadata: {
        reportId: String(updatedReport._id),
        fileName: updatedReport.fileName || null,
        bulanTahun: updatedReport.bulanTahun || null,
        kabupaten: updatedReport.kabupaten || null,
      },
    });

    res.status(200).json({ message: "Updated", reportId: updatedReport._id, report: updatedReport });
  } catch (e) {
    console.error("updateElderlyMonthlyReport error:", e);
    res.status(500).json({ message: "Server error updating report." });
  }
};

export const downloadElderlyMonthlyReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const doc: any = await ElderlyMonthlyReport.findById(id)
      .populate("createdBy", "firstName middleName lastName email")
      .lean();

    if (!doc) {
      res.status(404).json({ message: "Not found." });
      return;
    }

    const worksheetsSource =
      Array.isArray(doc.worksheets) && doc.worksheets.length > 0
        ? doc.worksheets
        : [
            {
              worksheetName: doc.sourceSheetName || "Sheet1",
              puskesmas: doc.puskesmas || "-",
              kabupaten: doc.kabupaten,
              bulanTahun: doc.bulanTahun,
              headerKeys: Array.isArray(doc.headerKeys) ? doc.headerKeys : [],
              headerLabels: Array.isArray(doc.headerLabels) ? doc.headerLabels : [],
              rowData: Array.isArray(doc.rowData) ? doc.rowData : [],
            },
          ];

    const normalizedWorksheets = worksheetsSource
      .map((ws: any, index: number) => {
        const headerKeys = Array.isArray(ws?.headerKeys) ? ws.headerKeys : [];
        const headerLabels = Array.isArray(ws?.headerLabels)
          ? ws.headerLabels
          : headerKeys.map((k: string) => String(k).toUpperCase());
        const rowData = Array.isArray(ws?.rowData) ? ws.rowData : [];

        return {
          worksheetName: String(ws?.worksheetName ?? `Sheet${index + 1}`).trim() || `Sheet${index + 1}`,
          puskesmas: String(ws?.puskesmas ?? doc.puskesmas ?? "-").trim() || "-",
          kabupaten: String(ws?.kabupaten ?? doc.kabupaten ?? "").trim(),
          bulanTahun: String(ws?.bulanTahun ?? doc.bulanTahun ?? "").trim(),
          headerKeys,
          headerLabels,
          rowData,
        };
      })
      .filter((ws: any) => ws.headerKeys.length > 0 && ws.rowData.length > 0);

    if (normalizedWorksheets.length === 0) {
      res.status(400).json({ message: "Report data is incomplete for download." });
      return;
    }

    const payload = {
      kabupaten: String(doc.kabupaten || normalizedWorksheets[0].kabupaten || "").trim(),
      bulanTahun: String(doc.bulanTahun || normalizedWorksheets[0].bulanTahun || "").trim(),
      worksheets: normalizedWorksheets,
    };

    const yearMatch = payload.bulanTahun.match(/\d{4}/);
    const reportYear = yearMatch ? yearMatch[0] : String(new Date().getFullYear());
    const monthIndex = findMonthIndex(payload.bulanTahun);

    const mergedRows = normalizedWorksheets.flatMap((ws: any) => ws.rowData || []);
    const mergedHeaderKeys = normalizedWorksheets[0]?.headerKeys || [];
    const puskesmasValue = String(normalizedWorksheets[0]?.puskesmas || doc.puskesmas || "-").trim() || "-";

    const monthSheetsB: Array<MonthSheetB | null> = Array(12).fill(null);
    const targetIndex = monthIndex >= 0 && monthIndex <= 11 ? monthIndex : 0;
    monthSheetsB[targetIndex] = {
      bulanTahun: payload.bulanTahun,
      puskesmas: puskesmasValue,
      rows: mergedRows,
      headerKeys: mergedHeaderKeys,
    };

    const buffer = await generateAnnualReportB({
      year: reportYear,
      kabupaten: payload.kabupaten || "-",
      puskesmas: puskesmasValue,
      monthSheets: monthSheetsB,
    });

    const uploadedFileName = String(doc.fileName || "Laporan_Bulanan.xlsx").trim();
    const dotIdx = uploadedFileName.lastIndexOf(".");
    const baseName = dotIdx > 0 ? uploadedFileName.slice(0, dotIdx) : uploadedFileName;

    const uploaderRaw = doc?.createdBy
      ? [doc.createdBy.firstName, doc.createdBy.middleName, doc.createdBy.lastName].filter(Boolean).join(" ").trim() || doc.createdBy.email || "Unknown"
      : "Unknown";

    const uploadedAt = doc.submittedAt || doc.createdAt || new Date();
    const dt = new Date(uploadedAt);
    const timestamp = Number.isNaN(dt.getTime())
      ? String(Date.now())
      : [
          dt.getFullYear(),
          String(dt.getMonth() + 1).padStart(2, "0"),
          String(dt.getDate()).padStart(2, "0"),
          String(dt.getHours()).padStart(2, "0"),
          String(dt.getMinutes()).padStart(2, "0"),
          String(dt.getSeconds()).padStart(2, "0"),
        ].join("");

    const sanitizePart = (value: string) =>
      value
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "")
        .trim() || "Unknown";

    const finalBase = `${sanitizePart(baseName)}_${sanitizePart(String(uploaderRaw))}_${timestamp}`;
    const filename = `${finalBase}.xlsx`;

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    console.error("downloadElderlyMonthlyReport error:", e);
    res.status(500).json({ message: "Server error downloading report." });
  }
};

export const deleteElderlyMonthlyReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const report = await ElderlyMonthlyReport.findById(id);
    if (!report) {
      res.status(404).json({ message: "Laporan tidak ditemukan." });
      return;
    }

    const reportObjectId = report._id;
    const reportSummary = {
      reportId: String(reportObjectId),
      fileName: report.fileName || null,
      bulanTahun: report.bulanTahun || null,
      kabupaten: report.kabupaten || null,
    };

    // Remove this report from all ElderlyPerson source arrays
    await ElderlyPerson.updateMany(
      { "sources.report": reportObjectId },
      { $pull: { sources: { report: reportObjectId } } }
    );

    // Delete persons who now have no remaining sources
    await ElderlyPerson.deleteMany({ sources: { $size: 0 } });

    // Clear stale lastReport references for persons that still have other sources
    await ElderlyPerson.updateMany(
      { lastReport: reportObjectId },
      { $unset: { lastReport: "", lastBulanTahun: "" } }
    );

    await ElderlyMonthlyReport.findByIdAndDelete(id);
    await recomputeWorkerTrackingStats(String(report.createdBy ?? req.user?.id ?? "").trim() || req.user?.id);

    await logActivity({
      userId: req.user?.id,
      action: "file_delete",
      details: "Menghapus file laporan bulanan",
      metadata: reportSummary,
    });

    res.status(200).json({ message: "Laporan dan data terkait berhasil dihapus." });
  } catch (e) {
    console.error("deleteElderlyMonthlyReport error:", e);
    res.status(500).json({ message: "Server error saat menghapus laporan." });
  }
};

/**
 * GET /api/lwreports/dashboard
 * Dashboard summary for client
 */
export const getDashboardData = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const docs = await ElderlyMonthlyReport.find(
      {},
      { rowData: 1, "worksheets.rowData": 1, bulanTahun: 1, puskesmas: 1, desa: 1, "worksheets.puskesmas": 1, "worksheets.desa": 1, submittedAt: 1, createdAt: 1 }
    ).lean();

    let totalRowsScanned = 0;
    let validRowsScanned = 0;

    const totalPraLansiaSet = new Set<string>();
    const totalLansiaSet = new Set<string>();
    const totalLansiaRistiSet = new Set<string>();
    const screenedLansiaSet = new Set<string>();
    const empowermentSet = new Set<string>();

    const independenceASet = new Set<string>();
    const independenceBSet = new Set<string>();
    const independenceCSet = new Set<string>();

    const maleSet = new Set<string>();
    const femaleSet = new Set<string>();

    const puskesmasSet = new Set<string>();
    const desaSet = new Set<string>();
    let latestDate: Date | null = null;
    let lastUpdated = "";

    for (const doc of docs) {
      const dt: Date | undefined = (doc as any).submittedAt || (doc as any).createdAt;
      if (dt && (!latestDate || dt > latestDate)) {
        latestDate = dt;
        lastUpdated = String((doc as any).bulanTahun || "").trim();
      }
      if ((doc as any).puskesmas) puskesmasSet.add(String((doc as any).puskesmas).trim().toUpperCase());
      if ((doc as any).desa) desaSet.add(String((doc as any).desa).trim().toUpperCase());
      if (Array.isArray((doc as any).worksheets)) {
        for (const ws of (doc as any).worksheets as any[]) {
          if (ws.puskesmas) puskesmasSet.add(String(ws.puskesmas).trim().toUpperCase());
          if (ws.desa) desaSet.add(String(ws.desa).trim().toUpperCase());
        }
      }
      const rows = extractRows(doc);
      totalRowsScanned += rows.length;

      for (const record of rows) {
        const nikValue = findValue(record, [
          (key) => key === "nik",
          (key) => key.includes("nik"),
          (key) => key.includes("noktp"),
          (key) => key.includes("ktp"),
        ]);
        const nik = String(nikValue ?? "").trim();
        if (!nik) continue;

        const ageValue = findValue(record, [
          (key) => key === "age",
          (key) => key === "umur",
          (key) => key === "usia",
          (key) => key.includes("umur"),
          (key) => key.includes("usia"),
        ]);
        let age = parseAge(ageValue);

        if (age === null) {
          const birthDateValue = findValue(record, [
            (key) => key === "birthdate",
            (key) => key === "tanggallahir",
            (key) => key === "tgllahir",
            (key) => key.includes("tanggal") && key.includes("lahir"),
            (key) => key.includes("lahir"),
            (key) => key.includes("birth") && key.includes("date"),
          ]);
          age = parseBirthDateToAge(birthDateValue);
        }

        if (age === null) continue;
        validRowsScanned += 1;

        const genderValue = findValue(record, [
          (key) => key === "jk",
          (key) => key === "gender",
          (key) => key === "jeniskelamin",
          (key) => key.includes("jenis") && key.includes("kelamin"),
        ]);
        const gender = normalizeGender(genderValue);
        if (gender === "L") maleSet.add(nik);
        if (gender === "P") femaleSet.add(nik);

        if (age >= 45 && age <= 59) {
          totalPraLansiaSet.add(nik);
        }

        if (age >= 60) {
          totalLansiaSet.add(nik);

          const screeningValue = findValue(record, [
            (key) => key === "screening",
            (key) => key.includes("skrining"),
          ]);
          if (parseBooleanFlag(screeningValue)) {
            screenedLansiaSet.add(nik);
          }

          const empowermentValue = findValue(record, [
            (key) => key === "empowerment",
            (key) => key.includes("pemberdayaan"),
          ]);
          if (parseBooleanFlag(empowermentValue)) {
            empowermentSet.add(nik);
          }

          const independenceLevel = normalizeIndependenceLevel(record);
          if (independenceLevel === "A") independenceASet.add(nik);
          if (independenceLevel === "B") independenceBSet.add(nik);
          if (independenceLevel === "C") independenceCSet.add(nik);
        }

        if (age >= 70) {
          totalLansiaRistiSet.add(nik);
        }
      }
    }

    res.json({
      totalReports: docs.length,
      totalRowsScanned,
      validRowsScanned,
      totalPraLansia: totalPraLansiaSet.size,
      totalLansia: totalLansiaSet.size,
      totalLansiaRisti: totalLansiaRistiSet.size,
      screenedLansia: screenedLansiaSet.size,
      empowermentCount: empowermentSet.size,
      independenceLevels: {
        A: independenceASet.size,
        B: independenceBSet.size,
        C: independenceCSet.size,
      },
      genderBreakdown: {
        male: maleSet.size,
        female: femaleSet.size,
      },
      lastUpdated,
      puskesmasCount: puskesmasSet.size,
      desaCount: desaSet.size,
    });
  } catch (e) {
    console.error("getDashboardData error:", e);
    res.status(500).json({ message: "Server error loading dashboard." });
  }
};

export const ElderlyMonthlyReportController = {
  getDashboardData,
};

// ─── Shared helper: gather 12 months of rowData for a year ────────────────────
async function buildMonthSheetsForYear(
  year: string,
  puskesmasFilter: string,
): Promise<{ monthSheetsA: Array<MonthSheet | null>; monthSheetsB: Array<MonthSheetB | null>; kabupaten: string; puskesmas: string }> {
  const yearPattern = new RegExp(`\\b${year}\\b`);
  const docs = await ElderlyMonthlyReport.find({ bulanTahun: yearPattern }).lean() as any[];

  const monthSheetsA: Array<MonthSheet | null> = Array(12).fill(null);
  const monthSheetsB: Array<MonthSheetB | null> = Array(12).fill(null);

  let detectedKabupaten = "";
  let detectedPuskesmas = puskesmasFilter || "";

  // Collect rows per month index
  const monthRows: Array<{ rows: any[]; headerKeys: string[]; puskesmas: string }[]> = Array.from({ length: 12 }, () => []);

  for (const doc of docs) {
    const bt = String(doc.bulanTahun ?? "").trim();
    const mIdx = findMonthIndex(bt);
    if (mIdx < 0) continue;

    if (!detectedKabupaten && doc.kabupaten) detectedKabupaten = String(doc.kabupaten).replace(/^:\s*/, "").trim();

    const worksheets = Array.isArray(doc.worksheets) && doc.worksheets.length > 0
      ? doc.worksheets
      : [{
          worksheetName: doc.sourceSheetName || "Sheet1",
          puskesmas: doc.puskesmas || "-",
          headerKeys: Array.isArray(doc.headerKeys) ? doc.headerKeys : [],
          rowData: Array.isArray(doc.rowData) ? doc.rowData : [],
        }];

    for (const ws of worksheets) {
      const wsPusk = String(ws.puskesmas ?? "").replace(/^:\s*/, "").trim();
      if (puskesmasFilter && wsPusk.toUpperCase() !== puskesmasFilter.toUpperCase()) continue;
      if (!detectedPuskesmas) detectedPuskesmas = wsPusk;

      const hk = Array.isArray(ws.headerKeys) ? ws.headerKeys : [];
      const rd = Array.isArray(ws.rowData) ? ws.rowData : [];
      if (hk.length > 0 && rd.length > 0) {
        monthRows[mIdx].push({ rows: rd, headerKeys: hk, puskesmas: wsPusk });
      }
    }
  }

  for (let m = 0; m < 12; m++) {
    const entries = monthRows[m];
    if (entries.length === 0) continue;
    // Merge all rows for this month
    const allRows = entries.flatMap(e => e.rows);
    const hk = entries[0].headerKeys;
    const pusk = entries[0].puskesmas || detectedPuskesmas;

    monthSheetsA[m] = { bulanTahun: "", puskesmas: pusk, rows: allRows, headerKeys: hk };
    monthSheetsB[m] = { bulanTahun: "", puskesmas: pusk, rows: allRows, headerKeys: hk };
  }

  return {
    monthSheetsA,
    monthSheetsB,
    kabupaten: detectedKabupaten,
    puskesmas: detectedPuskesmas,
  };
}

// ─── Annual Report A ──────────────────────────────────────────────────────────
export const downloadAnnualReportA = async (req: Request, res: Response): Promise<void> => {
  try {
    const { year } = req.params;
    if (!/^\d{4}$/.test(year)) {
      res.status(400).json({ message: "Tahun tidak valid." });
      return;
    }
    const puskesmasFilter = String(req.query.puskesmas ?? "").trim();
    const kabupatenFilter = String(req.query.kabupaten ?? "").trim();

    const { monthSheetsA, kabupaten, puskesmas } = await buildMonthSheetsForYear(year, puskesmasFilter);

    const buffer = await generateAnnualReportA({
      year,
      kabupaten: kabupatenFilter || kabupaten || "-",
      puskesmas: puskesmas || "-",
      monthSheets: monthSheetsA,
    });

    const safePusk = (puskesmas || "Puskesmas").replace(/\s+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Laporan_A_${safePusk}_${year}.xlsx"`);
    res.send(buffer);
  } catch (e) {
    console.error("downloadAnnualReportA error:", e);
    res.status(500).json({ message: "Server error generating annual report A." });
  }
};

// ─── Annual Report B ──────────────────────────────────────────────────────────
export const downloadAnnualReportB = async (req: Request, res: Response): Promise<void> => {
  try {
    const { year } = req.params;
    if (!/^\d{4}$/.test(year)) {
      res.status(400).json({ message: "Tahun tidak valid." });
      return;
    }
    const puskesmasFilter = String(req.query.puskesmas ?? "").trim();
    const kabupatenFilter = String(req.query.kabupaten ?? "").trim();

    const { monthSheetsB, kabupaten, puskesmas } = await buildMonthSheetsForYear(year, puskesmasFilter);

    const buffer = await generateAnnualReportB({
      year,
      kabupaten: kabupatenFilter || kabupaten || "-",
      puskesmas: puskesmas || "-",
      monthSheets: monthSheetsB,
    });

    const safePusk = (puskesmas || "Puskesmas").replace(/\s+/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="Laporan_B_${safePusk}_${year}.xlsx"`);
    res.send(buffer);
  } catch (e) {
    console.error("downloadAnnualReportB error:", e);
    res.status(500).json({ message: "Server error generating annual report B." });
  }
};