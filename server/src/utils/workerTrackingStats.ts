import { ElderlyMonthlyReport } from "../models/ElderlyMonthlyReport";
import User from "../models/User";

type IndividualRecord = Record<string, any>;

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

function findIdentityValue(record: IndividualRecord, predicates: Array<(key: string) => boolean>): string {
  const value = findValue(record, predicates);
  return String(value ?? "").trim();
}

function normalizeNIK(value: string): string {
  return value.replace(/\D/g, "").trim();
}

function findYearAndMonth(value: string): { year: string; month: number | null } | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const yearMatch = normalized.match(/(20\d{2}|19\d{2})/);
  if (!yearMatch) return null;

  const year = yearMatch[1];
  const upper = normalized.toUpperCase();
  const monthPatterns: Array<{ month: number; patterns: string[] }> = [
    { month: 1, patterns: ["JANUARI", "JANUARY", "JAN"] },
    { month: 2, patterns: ["FEBRUARI", "FEBRUARY", "FEB"] },
    { month: 3, patterns: ["MARET", "MARCH", "MAR"] },
    { month: 4, patterns: ["APRIL", "APR"] },
    { month: 5, patterns: ["MEI", "MAY"] },
    { month: 6, patterns: ["JUNI", "JUNE", "JUN"] },
    { month: 7, patterns: ["JULI", "JULY", "JUL"] },
    { month: 8, patterns: ["AGUSTUS", "AUGUST", "AGT", "AGST", "AGU", "AUG"] },
    { month: 9, patterns: ["SEPTEMBER", "SEPT", "SEP"] },
    { month: 10, patterns: ["OKTOBER", "OCTOBER", "OKT", "OCT"] },
    { month: 11, patterns: ["NOVEMBER", "NOV"] },
    { month: 12, patterns: ["DESEMBER", "DECEMBER", "DES", "DEC"] },
  ];

  for (const monthPattern of monthPatterns) {
    if (monthPattern.patterns.some((pattern) => upper.includes(pattern))) {
      return { year, month: monthPattern.month };
    }
  }

  const numericMonthMatch = normalized.match(/(?:^|\D)(0?[1-9]|1[0-2])(?:\D|$)/);
  if (numericMonthMatch) {
    return { year, month: Number(numericMonthMatch[1]) };
  }

  return { year, month: null };
}

function buildElderlyIdentityKey(record: IndividualRecord): string | null {
  const nik = normalizeNIK(
    findIdentityValue(record, [
      (key) => key === "nik",
      (key) => key.includes("nik"),
      (key) => key.includes("noktp"),
      (key) => key.includes("ktp"),
    ])
  );
  if (nik) return `nik:${nik}`;

  const name = normalizeLookupKey(
    findIdentityValue(record, [
      (key) => key === "nama",
      (key) => key === "name",
      (key) => key.includes("nama"),
      (key) => key.includes("name"),
    ])
  );
  const birthDate = normalizeLookupKey(
    findIdentityValue(record, [
      (key) => key === "tanggallahir",
      (key) => key === "tgllahir",
      (key) => key === "birthdate",
      (key) => key.includes("tanggal") && key.includes("lahir"),
      (key) => key.includes("birth") && key.includes("date"),
    ])
  );
  const address = normalizeLookupKey(
    findIdentityValue(record, [
      (key) => key === "alamat",
      (key) => key.includes("alamat"),
      (key) => key.includes("address"),
    ])
  );

  if (!name) return null;
  return `fallback:${name}|${birthDate}|${address}`;
}

export async function recomputeWorkerTrackingStats(userId: string | undefined): Promise<void> {
  if (!userId) return;

  const reports = await ElderlyMonthlyReport.find(
    { createdBy: userId },
    { bulanTahun: 1, rowData: 1, "worksheets.rowData": 1 }
  ).lean();

  const yearlyMap = new Map<string, { totalKeys: Set<string>; monthKeys: Map<number, Set<string>> }>();

  for (const report of reports) {
    const period = findYearAndMonth(String((report as any)?.bulanTahun ?? ""));
    if (!period?.year || !period.month) continue;

    const yearEntry = yearlyMap.get(period.year) ?? {
      totalKeys: new Set<string>(),
      monthKeys: new Map<number, Set<string>>(),
    };

    const monthSet = yearEntry.monthKeys.get(period.month) ?? new Set<string>();
    const rows = extractRows(report);

    for (const record of rows) {
      const identityKey = buildElderlyIdentityKey(record);
      if (!identityKey) continue;
      yearEntry.totalKeys.add(identityKey);
      monthSet.add(identityKey);
    }

    yearEntry.monthKeys.set(period.month, monthSet);
    yearlyMap.set(period.year, yearEntry);
  }

  const now = new Date();
  const yearly = Array.from(yearlyMap.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, entry]) => ({
      year,
      totalUniqueElderly: entry.totalKeys.size,
      monthlyCounts: Array.from({ length: 12 }, (_, index) => ({
        month: index + 1,
        count: entry.monthKeys.get(index + 1)?.size ?? 0,
      })),
      updatedAt: now,
    }));

  await User.findByIdAndUpdate(userId, {
    $set: {
      trackingStats: {
        yearly,
        updatedAt: now,
      },
    },
  });
}