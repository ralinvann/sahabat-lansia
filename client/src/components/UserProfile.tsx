import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Mail, Calendar, Activity, Edit3, Save, Upload, X, RefreshCcw, Download, Eye, Loader, Users } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

const btnAnim = "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]";

interface UserProfileProps {
  onNavigate?: (page: string, state?: any) => void;
}

interface UploadedReportItem {
  _id: string;
  fileName?: string;
  bulanTahun?: string;
  desa?: string;
  puskesmas?: string;
  kabupaten?: string;
  createdBy?: {
    _id?: string;
    id?: string;
    email?: string;
  };
  submittedAt?: string;
  createdAt: string;
}

const MONTH_LABELS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function UserProfile({ onNavigate }: UserProfileProps) {
  const { user, ready, loading, updateProfile, uploadAvatar, fetchMe } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [uploadedReports, setUploadedReports] = useState<UploadedReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [serverMsg, setServerMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [selectedStatsYear, setSelectedStatsYear] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setMiddleName(user.middleName ?? "");
    setLastName(user.lastName ?? "");
    setPhone(user.phone ?? "");
    setWorkLocation(user.workLocation ?? "");
  }, [user]);

  const initials = useMemo(() => `${(user?.firstName || "?")[0] ?? "?"}${(user?.lastName || "")[0] ?? ""}`.toUpperCase(), [user]);
  const joinDate = useMemo(() => {
    if (!user?.createdAt) return "-";
    try { return new Date(user.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" }); } catch { return "-"; }
  }, [user]);

  const trackingYears = useMemo(() => user?.trackingStats?.yearly ?? [], [user?.trackingStats]);

  useEffect(() => {
    if (trackingYears.length === 0) {
      setSelectedStatsYear("");
      return;
    }

    setSelectedStatsYear((currentYear) =>
      trackingYears.some((entry) => entry.year === currentYear)
        ? currentYear
        : trackingYears[0].year
    );
  }, [trackingYears]);

  const activeTrackingYear = useMemo(
    () => trackingYears.find((entry) => entry.year === selectedStatsYear) ?? trackingYears[0],
    [selectedStatsYear, trackingYears]
  );

  const activeMonthlyCounts = useMemo(() => {
    const countsByMonth = new Map<number, number>();
    for (const entry of activeTrackingYear?.monthlyCounts ?? []) {
      countsByMonth.set(entry.month, entry.count);
    }

    return MONTH_LABELS.map((label, index) => ({
      month: index + 1,
      label,
      count: countsByMonth.get(index + 1) ?? 0,
    }));
  }, [activeTrackingYear]);

  const formatTimestamp = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString("id-ID");
    } catch {
      return "-";
    }
  };

  const loadUploadedReports = async () => {
    if (!user?.id) return;
    setReportsLoading(true);
    setReportsError(null);
    try {
      const { data } = await api.get("/elderly-reports");
      const items = Array.isArray(data?.items) ? data.items : [];
      const ownReports = items
        .filter((item: any) => {
          const createdById = String(item?.createdBy?._id ?? item?.createdBy?.id ?? "").trim();
          return createdById === user.id;
        })
        .map((item: any) => ({
          _id: String(item?._id ?? ""),
          fileName: String(item?.fileName ?? "").trim(),
          bulanTahun: String(item?.bulanTahun ?? "").trim(),
          desa: String(item?.desa ?? item?.worksheets?.[0]?.desa ?? "").replace(/^:\s*/, "").trim(),
          puskesmas: String(item?.puskesmas ?? item?.worksheets?.[0]?.puskesmas ?? "").replace(/^:\s*/, "").trim(),
          kabupaten: String(item?.kabupaten ?? item?.worksheets?.[0]?.kabupaten ?? "").replace(/^:\s*/, "").trim(),
          createdBy: item?.createdBy,
          submittedAt: item?.submittedAt,
          createdAt: String(item?.createdAt ?? ""),
        }))
        .filter((item: UploadedReportItem) => Boolean(item._id))
        .sort((a: UploadedReportItem, b: UploadedReportItem) => {
          const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
          const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
          return bTime - aTime;
        });
      setUploadedReports(ownReports);
    } catch {
      setUploadedReports([]);
      setReportsError("Gagal memuat daftar file terunggah.");
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    if (!ready || !user?.id) return;
    void loadUploadedReports();
  }, [ready, user?.id]);

  const handleOpenViewReport = (report: UploadedReportItem) => {
    onNavigate?.("uploaded-data-view", {
      reportId: report._id,
      origin: "account",
      scrollY: typeof window !== "undefined" ? window.scrollY : 0,
    });
  };

  const handleDownloadReport = async (report: UploadedReportItem) => {
    if (!report?._id) return;
    try {
      setDownloadingReportId(report._id);
      const response = await api.get(`/elderly-reports/${report._id}/download`, {
        responseType: "blob",
      });

      const contentDisposition = String(response.headers?.["content-disposition"] || "");
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const uploadedFileName = String(report?.fileName || "Laporan_Bulanan.xlsx").trim();
      const dotIdx = uploadedFileName.lastIndexOf(".");
      const baseName = dotIdx > 0 ? uploadedFileName.slice(0, dotIdx) : uploadedFileName;
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
      const fallback = `${sanitizePart(baseName)}_${timestamp}.xlsx`;
      const filename = match?.[1] || fallback;

      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setServerMsg({ type: "err", text: e?.response?.data?.message || e?.message || "Gagal mengunduh laporan." });
    } finally {
      setDownloadingReportId(null);
    }
  };

  const handleSave = async () => {
    setServerMsg(null);
    if (!firstName.trim() || !lastName.trim()) { setServerMsg({ type: "err", text: "Nama depan dan belakang wajib diisi." }); return; }
    const res = await updateProfile({
      firstName: firstName.trim(),
      middleName: middleName.trim(),
      lastName: lastName.trim(),
      phone: phone.trim(),
      workLocation: workLocation.trim(),
    });
    if (res.ok) { setServerMsg({ type: "ok", text: "Profil diperbarui." }); setIsEditing(false); }
    else setServerMsg({ type: "err", text: res.message || "Gagal memperbarui." });
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setServerMsg(null);
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) { setServerMsg({ type: "err", text: "Format tidak didukung." }); e.target.value = ""; return; }
    if (f.size > 5 * 1024 * 1024) { setServerMsg({ type: "err", text: "Max 5MB." }); e.target.value = ""; return; }
    const res = await uploadAvatar(f);
    if (res.ok) setServerMsg({ type: "ok", text: "Foto diperbarui." });
    else setServerMsg({ type: "err", text: res.message || "Gagal mengunggah." });
    e.target.value = "";
  };

  const handleChangePassword = async () => {
    setPwdMsg(null);

    if (!oldPassword || !newPassword || !confirmNewPassword) {
      setPwdMsg({ type: "err", text: "Password lama, password baru, dan konfirmasi wajib diisi." });
      return;
    }

    if (newPassword.length < 6) {
      setPwdMsg({ type: "err", text: "Password baru minimal 6 karakter." });
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPwdMsg({ type: "err", text: "Konfirmasi password tidak cocok." });
      return;
    }

    setPwdSubmitting(true);
    try {
      const { data } = await api.post("/auth/change-password", {
        oldPassword,
        newPassword,
        confirmPassword: confirmNewPassword,
      });
      setPwdMsg({ type: "ok", text: String(data?.message || "Password berhasil diubah.") });
      setOldPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (e: any) {
      setPwdMsg({ type: "err", text: e?.response?.data?.message || "Gagal mengubah password." });
    } finally {
      setPwdSubmitting(false);
    }
  };

  if (!ready) return <div className="p-6 text-sm text-muted-foreground">Loading profil...</div>;
  if (!user) return (
    <div className="p-6"><Card className="shadow-sm"><CardHeader><CardTitle>Profil</CardTitle></CardHeader><CardContent className="text-sm">Silakan masuk untuk melihat profil.</CardContent></Card></div>
  );

  const meta = {
    email: user.email,
    phone: user.phone || "",
    location: user.workLocation || "",
    lastActive: user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : "-",
  };
  const displayName = [firstName, middleName, lastName].filter(Boolean).join(" ");

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Profil Pengguna</h2>
          <p className="text-sm text-muted-foreground mt-1">Kelola informasi akun dan aktivitas Anda</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={loading} className={`gap-2 ${btnAnim}`}>
            <Upload className="w-4 h-4" /> Ganti Foto
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleAvatarChange(e)} />
          <Button variant="outline" onClick={() => void fetchMe()} disabled={loading} className={`gap-2 ${btnAnim}`}>
            <RefreshCcw className="w-4 h-4" /> Muat Ulang
          </Button>
          <Button variant={isEditing ? "default" : "outline"} onClick={() => isEditing ? void handleSave() : setIsEditing(true)} disabled={loading} className={`gap-2 ${btnAnim}`}>
            {isEditing ? <Save className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
            {isEditing ? "Simpan" : "Edit Profil"}
          </Button>
        </div>
      </div>

      {serverMsg && (
        <div className={`p-3 rounded-md flex items-center justify-between text-sm ${serverMsg.type === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          <span>{serverMsg.text}</span>
          <button onClick={() => setServerMsg(null)} className="p-1 rounded hover:bg-black/5"><X className="w-3 h-3" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        <Card className="shadow-sm">
          <CardHeader className="pb-2"><CardTitle style={{ fontSize: "1.125rem" }}>Profil Pengguna</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-5">
              <Avatar className="w-20 h-20">
                <AvatarImage src={user.profilePicture || ""} />
                <AvatarFallback style={{ fontSize: "1.25rem" }}>{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <h3 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{displayName || "-"}</h3>
                <p className="text-sm text-muted-foreground capitalize">{String(user.role || "").toLowerCase()}</p>
                <Badge variant="secondary" className="mt-1 text-xs">Aktif</Badge>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                { label: "Nama Depan", val: firstName, set: setFirstName, editable: true, span: "" },
                { label: "Nama Tengah (opsional)", val: middleName, set: setMiddleName, editable: true, span: "" },
                { label: "Nama Belakang", val: lastName, set: setLastName, editable: true, span: "md:col-span-2" },
                { label: "Telepon", val: phone, set: setPhone, editable: true, span: "" },
                { label: "Lokasi Kerja", val: workLocation, set: setWorkLocation, editable: true, span: "" },
              ].map(({ label, val, set, editable, span }, i) => (
                <div key={i} className={`space-y-1.5 ${span}`}>
                  <Label className="text-sm">{label}</Label>
                  {isEditing && editable ? (
                    <Input
                      className="h-10 bg-muted rounded-md ring-2 ring-green-500 ring-offset-1 focus:outline-none focus:ring-green-600"
                      value={val}
                      onChange={(e) => set(e.target.value)}
                    />
                  ) : (
                    <p className="text-sm p-2.5 bg-muted rounded-md">{val || "-"}</p>
                  )}
                </div>
              ))}
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-sm flex items-center gap-1.5"><Mail className="w-4 h-4" /> Email</Label>
                <p className="text-sm p-2.5 bg-muted rounded-md">{meta.email}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Bergabung Sejak</Label>
                <p className="text-sm p-2.5 bg-muted rounded-md">{joinDate}</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5"><Activity className="w-4 h-4" /> Terakhir Aktif</Label>
                <p className="text-sm p-2.5 bg-muted rounded-md">{meta.lastActive}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle style={{ fontSize: "1.125rem" }}>Statistik Lansia Saya</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Dihitung khusus dari file yang Anda unggah, deduplikasi berdasarkan NIK per tahun.</p>
              </div>
              {trackingYears.length > 0 ? (
                <select
                  value={activeTrackingYear?.year ?? ""}
                  onChange={(event) => setSelectedStatsYear(event.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {trackingYears.map((entry) => (
                    <option key={entry.year} value={entry.year}>{entry.year}</option>
                  ))}
                </select>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeTrackingYear ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="w-4 h-4" />
                      Total lansia unik tahun {activeTrackingYear.year}
                    </div>
                    <div className="mt-2 text-3xl font-semibold">{activeTrackingYear.totalUniqueElderly}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="text-sm text-muted-foreground">Bulan aktif</div>
                    <div className="mt-2 text-3xl font-semibold">{activeMonthlyCounts.filter((entry) => entry.count > 0).length}</div>
                  </div>
                </div>

                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Bulan</TableHead>
                        <TableHead className="text-right">Lansia unik</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeMonthlyCounts.map((entry) => (
                        <TableRow key={entry.month}>
                          <TableCell>{entry.label}</TableCell>
                          <TableCell className="text-right font-medium">{entry.count}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                Belum ada statistik personal. Data akan muncul setelah Anda mengunggah laporan bulanan dengan data lansia yang memiliki NIK.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <CardTitle style={{ fontSize: "1.125rem" }}>Uploaded Files</CardTitle>
              <Button variant="outline" className={btnAnim} onClick={() => void loadUploadedReports()} disabled={reportsLoading}>
                {reportsLoading ? "Loading..." : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {reportsError && <div className="mb-3 p-2.5 rounded-md text-sm bg-red-50 text-red-700">{reportsError}</div>}
            <div className="max-h-[420px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nama</TableHead>
                    <TableHead className="text-xs">Tanggal</TableHead>
                    <TableHead className="text-xs text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportsLoading ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground py-8 text-center">Loading file...</TableCell>
                    </TableRow>
                  ) : uploadedReports.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground py-8 text-center">Belum ada file yang diunggah.</TableCell>
                    </TableRow>
                  ) : (
                    uploadedReports.map((report) => {
                      const displayName = `${report.bulanTahun || "-"} - ${report.desa || "-"}`;
                      const displayDate = report.submittedAt || report.createdAt;
                      return (
                        <TableRow key={report._id} className="hover:bg-muted/50">
                          <TableCell className="text-sm">
                            <div className="font-medium">{displayName}</div>
                            <div className="text-xs text-muted-foreground truncate max-w-[260px]" title={report.fileName || ""}>{report.fileName || "-"}</div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{displayDate ? formatTimestamp(displayDate) : "-"}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${btnAnim}`}
                                onClick={() => handleOpenViewReport(report)}
                                title="Preview"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${btnAnim}`}
                                disabled={downloadingReportId === report._id}
                                onClick={() => void handleDownloadReport(report)}
                                title="Download"
                              >
                                {downloadingReportId === report._id
                                  ? <Loader className="w-3.5 h-3.5 animate-spin" />
                                  : <Download className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle style={{ fontSize: "1.125rem" }}>Ganti Password</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {pwdMsg && (
            <div className={`p-3 rounded-md text-sm ${pwdMsg.type === "ok" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {pwdMsg.text}
            </div>
          )}

          <div className="grid md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">Password Lama</Label>
              <Input
                type="password"
                className="h-10"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                disabled={pwdSubmitting || loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Password Baru</Label>
              <Input
                type="password"
                className="h-10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={pwdSubmitting || loading}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Konfirmasi Password Baru</Label>
              <Input
                type="password"
                className="h-10"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                disabled={pwdSubmitting || loading}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => void handleChangePassword()}
              disabled={pwdSubmitting || loading}
              className={btnAnim}
            >
              {pwdSubmitting ? "Memproses..." : "Simpan Password Baru"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
