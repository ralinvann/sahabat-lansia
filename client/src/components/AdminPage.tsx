import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Label } from "./ui/label";
import { Users, Shield, Activity, Search, UserPlus, Settings, Eye, Edit3, Trash2, Loader, ArrowUpDown, ArrowUp, ArrowDown, Download } from "lucide-react";
import { AddUserDialog } from "./AddUserDialog";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

const btnAnim = "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]";

interface AdminPageProps {
  onNavigate?: (page: string, state?: any) => void;
}

export function AdminPage({ onNavigate }: AdminPageProps) {
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [fetchedUsers, setFetchedUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [locationConfigs, setLocationConfigs] = useState<any[]>([]);
  const [kabupatenInput, setKabupatenInput] = useState("");
  const [desaDraft, setDesaDraft] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);
  const [recentReports, setRecentReports] = useState<any[]>([]);
  const [reportSearch, setReportSearch] = useState("");
  const [reportYearFilter, setReportYearFilter] = useState("all");
  const [reportMonthFilter, setReportMonthFilter] = useState("all");
  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);
  const [downloadingReportId, setDownloadingReportId] = useState<string | null>(null);
  const [viewUser, setViewUser] = useState<any | null>(null);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ firstName: "", middleName: "", lastName: "", email: "", role: "officer", phone: "", workLocation: "" });
  const [savingEditUser, setSavingEditUser] = useState(false);
  const { user, ready } = useAuth();

  const ALLOWED_ROLES = new Set(["ADMIN", "SUPERADMIN"]);
  const isSuperadmin = String(user?.role || "").toUpperCase() === "SUPERADMIN";

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true); setError(null);
        const [usersRes, locsRes, reportsRes] = await Promise.all([api.get("/users"), api.get("/locations"), api.get("/elderly-reports")]);
        setFetchedUsers(usersRes.data);
        setLocationConfigs(Array.isArray(locsRes.data?.items) ? locsRes.data.items : []);
        setRecentReports(Array.isArray(reportsRes.data?.items) ? reportsRes.data.items : []);
      } catch (err: any) {
        setError(err.response?.data?.message || "Gagal memuat data pengguna");
      } finally { setIsLoading(false); }
    };
    if (ready && user && ALLOWED_ROLES.has(String(user.role || "").toUpperCase())) fetchUsers();
  }, [ready, user]);

  const handleLoadKabupaten = (kabupaten: string) => {
    setKabupatenInput(kabupaten);
    const found = locationConfigs.find((it: any) => String(it?.kabupaten ?? "").trim().toLowerCase() === kabupaten.trim().toLowerCase());
    setDesaDraft((Array.isArray(found?.desaList) ? found.desaList : []).join("\n"));
  };

  const handleSaveLocationConfig = async () => {
    const kabupaten = kabupatenInput.trim();
    if (!kabupaten) { alert("Kabupaten wajib diisi"); return; }
    const desaList = desaDraft.split(/\n|,/).map((d) => d.trim()).filter(Boolean);
    try {
      setSavingLocation(true);
      await api.put(`/locations/${encodeURIComponent(kabupaten)}`, { desaList });
      const refreshed = await api.get("/locations");
      setLocationConfigs(Array.isArray(refreshed.data?.items) ? refreshed.data.items : []);
      alert("Konfigurasi desa berhasil disimpan.");
    } catch (err: any) { alert(err?.response?.data?.message || "Gagal menyimpan."); }
    finally { setSavingLocation(false); }
  };

  const getSubmitterName = (report: any) => {
    const u = report?.createdBy; if (!u) return "Tidak Diketahui";
    return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ").trim() || u.email || "Tidak Diketahui";
  };

  const getFullName = (d: any) => [d.firstName, d.middleName, d.lastName].filter(Boolean).join(" ") || "Tidak Diketahui";
  const getInitials = (d: any) => getFullName(d).split(" ").map((n: string) => n[0]).join("").toUpperCase();
  const getUserId = (d: any) => String(d?._id ?? d?.id ?? "");

  const filteredAndSortedUsers = fetchedUsers
    .filter((d) => {
      if (!searchTerm) return true;
      const s = searchTerm.toLowerCase();
      return getFullName(d).toLowerCase().includes(s) || (d.email?.toLowerCase() || "").includes(s) || (d.role?.toLowerCase() || "").includes(s);
    })
    .sort((a, b) => {
      if (!sortField) return 0;
      let aV = "", bV = "";
      if (sortField === 'name') { aV = getFullName(a).toLowerCase(); bV = getFullName(b).toLowerCase(); }
      else if (sortField === 'email') { aV = a.email?.toLowerCase() || ""; bV = b.email?.toLowerCase() || ""; }
      else if (sortField === 'role') { aV = a.role?.toLowerCase() || ""; bV = b.role?.toLowerCase() || ""; }
      return aV < bV ? (sortDirection === 'asc' ? -1 : 1) : aV > bV ? (sortDirection === 'asc' ? 1 : -1) : 0;
    });

  const handleSort = (field: string) => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const handleDeleteUser = async (userData: any) => {
    if (!confirm(`Hapus pengguna ${getFullName(userData)}?`)) return;
    try { await api.delete(`/users/${userData._id}`); setFetchedUsers((p) => p.filter((u) => u._id !== userData._id)); }
    catch (err: any) { alert("Gagal menghapus: " + (err.response?.data?.message || "Error")); }
  };

  const handleOpenViewUser = (userData: any) => {
    setViewUser(userData);
  };

  const handleOpenEditUser = (userData: any) => {
    setEditUser(userData);
    setEditForm({
      firstName: String(userData?.firstName ?? ""),
      middleName: String(userData?.middleName ?? ""),
      lastName: String(userData?.lastName ?? ""),
      email: String(userData?.email ?? ""),
      role: String(userData?.role ?? "officer"),
      phone: String(userData?.phone ?? ""),
      workLocation: String(userData?.workLocation ?? ""),
    });
  };

  const handleSaveEditUser = async () => {
    if (!editUser) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim()) {
      alert("Nama depan dan belakang wajib diisi.");
      return;
    }
    if (!editForm.email.includes("@")) {
      alert("Email tidak valid.");
      return;
    }

    const payload: Record<string, any> = {
      firstName: editForm.firstName.trim(),
      middleName: editForm.middleName.trim(),
      lastName: editForm.lastName.trim(),
      email: editForm.email.trim().toLowerCase(),
      phone: editForm.phone.trim(),
      workLocation: editForm.workLocation.trim(),
    };

    if (isSuperadmin) {
      payload.role = editForm.role;
    }

    setSavingEditUser(true);
    try {
      const id = getUserId(editUser);
      const { data } = await api.put(`/users/${id}`, payload);
      const updated = data;
      setFetchedUsers((prev) => prev.map((u) => (getUserId(u) === id ? { ...u, ...updated } : u)));
      setEditUser(null);
      alert("Data pengguna berhasil diperbarui.");
    } catch (err: any) {
      alert(err?.response?.data?.message || "Gagal memperbarui pengguna.");
    } finally {
      setSavingEditUser(false);
    }
  };

  const handleDeleteReport = async (report: any) => {
    const label = `${report.bulanTahun || "-"} — ${report.kabupaten || "-"}`;
    if (!confirm(`Hapus laporan "${label}" beserta semua data terkait?\nTindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingReportId(report._id);
    try {
      await api.delete(`/elderly-reports/${report._id}`);
      setRecentReports((prev) => prev.filter((r) => r._id !== report._id));
    } catch (err: any) {
      alert("Gagal menghapus laporan: " + (err?.response?.data?.message || "Error"));
    } finally {
      setDeletingReportId(null);
    }
  };

  const handleDownloadReport = async (report: any) => {
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
      alert("Gagal mengunduh laporan: " + (err?.response?.data?.message || err?.message || "Error"));
    } finally {
      setDownloadingReportId(null);
    }
  };

  const handleOpenViewReport = (report: any) => {
    onNavigate?.("uploaded-data-view", { reportId: report?._id || null });
  };

  const getReportYear = (r: any) => {
    const m = String(r.bulanTahun || "").match(/\d{4}/);
    return m ? m[0] : "";
  };

  const getReportMonth = (r: any) => {
    const raw = String(r.bulanTahun || "").toUpperCase();
    const months = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];
    for (const m of months) { if (raw.includes(m)) return m; }
    return "";
  };

  const MONTH_OPTIONS = ["JANUARI","FEBRUARI","MARET","APRIL","MEI","JUNI","JULI","AGUSTUS","SEPTEMBER","OKTOBER","NOVEMBER","DESEMBER"];

  const reportYearOptions = useMemo(() => {
    const years = new Set(recentReports.map(getReportYear).filter(Boolean));
    return Array.from(years).sort().reverse();
  }, [recentReports]);

  const filteredReports = useMemo(() => {
    return recentReports.filter((r) => {
      if (reportYearFilter && reportYearFilter !== "all" && getReportYear(r) !== reportYearFilter) return false;
      if (reportMonthFilter && reportMonthFilter !== "all" && getReportMonth(r) !== reportMonthFilter) return false;
      if (reportSearch) {
        const s = reportSearch.toLowerCase();
        const fields = [
          r.fileName, r.bulanTahun, r.kabupaten,
          r.puskesmas ?? r.worksheets?.[0]?.puskesmas,
          getSubmitterName(r),
        ];
        if (!fields.some((f) => String(f ?? "").toLowerCase().includes(s))) return false;
      }
      return true;
    });
  }, [recentReports, reportSearch, reportYearFilter, reportMonthFilter]);

  if (!ready) return <div className="p-6 text-sm text-muted-foreground">Memuat data...</div>;
  if (!user || !ALLOWED_ROLES.has(String(user.role || "").toUpperCase())) return (
    <div className="p-6"><Card className="shadow-sm"><CardHeader><CardTitle>Akses Ditolak</CardTitle></CardHeader><CardContent className="text-sm">Anda tidak memiliki izin untuk halaman ini.</CardContent></Card></div>
  );

  const displayUsers = isLoading ? [] : filteredAndSortedUsers;

  const systemStats = [
    { title: "Total Pengguna", value: "24", subtitle: "4 aktif hari ini", icon: Users, color: "text-blue-600", bgColor: "bg-blue-50" },
    { title: "Data Lansia", value: "14,500", subtitle: "892 ditambah bulan ini", icon: Activity, color: "text-green-600", bgColor: "bg-green-50" },
    { title: "Akses Harian", value: "156", subtitle: "Login hari ini", icon: Eye, color: "text-orange-600", bgColor: "bg-orange-50" },
    { title: "Sistem", value: "99.9%", subtitle: "Uptime bulan ini", icon: Shield, color: "text-purple-600", bgColor: "bg-purple-50" },
  ];

  const getLastLoginLogs = () => fetchedUsers
    .filter((u) => u.lastLoginAt)
    .sort((a, b) => new Date(b.lastLoginAt!).getTime() - new Date(a.lastLoginAt!).getTime())
    .slice(0, 5)
    .map((u) => ({ user: getFullName(u), action: "Masuk ke sistem", details: `IP ${u.lastLoginIP || 'tidak diketahui'}`, timestamp: u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('id-ID') : 'Tidak Diketahui', bgColor: "bg-blue-100", textColor: "text-blue-600" }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Panel Admin</h2>
          <p className="text-sm text-muted-foreground mt-1">Kelola pengguna, sistem, dan keamanan</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className={`gap-2 ${btnAnim}`}><Settings className="w-4 h-4" />Pengaturan</Button>
          <Button onClick={() => setIsAddUserDialogOpen(true)} className={`gap-2 ${btnAnim}`}><UserPlus className="w-4 h-4" />Tambah Pengguna</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {systemStats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index} className="shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-muted-foreground">{stat.title}</CardTitle>
                  <div className={`p-2.5 rounded-full ${stat.bgColor}`}><Icon className={`w-5 h-5 ${stat.color}`} /></div>
                </div>
              </CardHeader>
              <CardContent>
                <div style={{ fontSize: "1.75rem", fontWeight: 700 }} className="mb-1">{stat.value}</div>
                <p className="text-sm text-muted-foreground">{stat.subtitle}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* User Table */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle style={{ fontSize: "1.125rem" }}>Basis Data Pengguna</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input placeholder="Cari pengguna..." className="pl-9 h-9 w-56" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
          {isLoading ? (
            <div className="flex items-center justify-center py-10"><Loader className="w-5 h-5 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Memuat...</span></div>
          ) : displayUsers.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">Tidak ada pengguna ditemukan</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><Button variant="ghost" className="h-auto p-0 hover:bg-transparent gap-1" onClick={() => handleSort('name')}>Pengguna {getSortIcon('name')}</Button></TableHead>
                    <TableHead><Button variant="ghost" className="h-auto p-0 hover:bg-transparent gap-1" onClick={() => handleSort('email')}>Email {getSortIcon('email')}</Button></TableHead>
                    <TableHead><Button variant="ghost" className="h-auto p-0 hover:bg-transparent gap-1" onClick={() => handleSort('role')}>Peran {getSortIcon('role')}</Button></TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayUsers.map((userData) => (
                    <TableRow key={getUserId(userData)} className="hover:bg-muted/50">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar className="w-8 h-8"><AvatarImage src={userData.profilePicture} /><AvatarFallback className="text-xs">{getInitials(userData)}</AvatarFallback></Avatar>
                          <span className="text-sm" style={{ fontWeight: 500 }}>{getFullName(userData)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{userData.email}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs capitalize">{userData.role}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className={`h-7 w-7 ${btnAnim}`} onClick={() => handleOpenViewUser(userData)}><Eye className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className={`h-7 w-7 ${btnAnim}`} onClick={() => handleOpenEditUser(userData)}><Edit3 className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className={`h-7 w-7 text-destructive hover:text-destructive ${btnAnim}`} onClick={() => handleDeleteUser(userData)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Location Config */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle style={{ fontSize: "1.125rem" }}>Konfigurasi Kabupaten - Desa</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm" style={{ fontWeight: 500 }}>Pilih Kabupaten</label>
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {locationConfigs.map((cfg: any) => (
                  <Button key={cfg._id || cfg.kabupaten} variant="outline" size="sm" onClick={() => handleLoadKabupaten(String(cfg.kabupaten || ""))} className={btnAnim}>{cfg.kabupaten}</Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm" style={{ fontWeight: 500 }}>Kabupaten</label>
              <Input className="mt-1.5 h-9" placeholder="Contoh: DAIRI" value={kabupatenInput} onChange={(e) => setKabupatenInput(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm" style={{ fontWeight: 500 }}>Daftar Desa</label>
            <Textarea className="mt-1.5 min-h-[100px]" placeholder="Pisahkan baris baru atau koma" value={desaDraft} onChange={(e) => setDesaDraft(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveLocationConfig} disabled={savingLocation} className={btnAnim}>{savingLocation ? "Menyimpan..." : "Simpan Konfigurasi"}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded Files Management */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <CardTitle style={{ fontSize: "1.125rem" }}>Manajemen File Terunggah</CardTitle>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={reportYearFilter} onValueChange={setReportYearFilter}>
                <SelectTrigger className="h-9 w-36">
                  <SelectValue placeholder="Semua tahun" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua tahun</SelectItem>
                  {reportYearOptions.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={reportMonthFilter} onValueChange={setReportMonthFilter}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="Semua bulan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua bulan</SelectItem>
                  {MONTH_OPTIONS.map((m) => (
                    <SelectItem key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Cari file, puskesmas, pengirim..."
                  className="pl-9 h-9 w-64"
                  value={reportSearch}
                  onChange={(e) => setReportSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nama File</TableHead>
                  <TableHead className="text-xs">Bulan/Tahun</TableHead>
                  <TableHead className="text-xs">Kabupaten</TableHead>
                  <TableHead className="text-xs">Puskesmas</TableHead>
                  <TableHead className="text-xs">Pengirim</TableHead>
                  <TableHead className="text-xs">Waktu Upload</TableHead>
                  <TableHead className="text-xs">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                      {recentReports.length === 0 ? "Belum ada laporan terunggah." : "Tidak ada laporan sesuai filter."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReports.map((r: any) => (
                    <TableRow key={r._id} className="hover:bg-muted/50">
                      <TableCell className="text-sm font-medium max-w-[180px] truncate" title={r.fileName || "-"}>{r.fileName || "-"}</TableCell>
                      <TableCell className="text-sm">{r.bulanTahun || "-"}</TableCell>
                      <TableCell className="text-sm">{String(r.kabupaten || "-").replace(/^:\s*/, "")}</TableCell>
                      <TableCell className="text-sm">{String(r.puskesmas || r.worksheets?.[0]?.puskesmas || "-").replace(/^:\s*/, "")}</TableCell>
                      <TableCell className="text-sm">{getSubmitterName(r)}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{r.submittedAt || r.createdAt ? new Date(r.submittedAt || r.createdAt).toLocaleString("id-ID") : "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${btnAnim}`}
                            onClick={() => handleOpenViewReport(r)}
                            title="Lihat data upload"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 ${btnAnim}`}
                            disabled={downloadingReportId === r._id}
                            onClick={() => void handleDownloadReport(r)}
                            title="Unduh file laporan"
                          >
                            {downloadingReportId === r._id
                              ? <Loader className="w-3.5 h-3.5 animate-spin" />
                              : <Download className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 text-destructive hover:text-destructive ${btnAnim}`}
                            disabled={deletingReportId === r._id}
                            onClick={() => handleDeleteReport(r)}
                            title="Hapus laporan dan data terkait"
                          >
                            {deletingReportId === r._id
                              ? <Loader className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {filteredReports.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2 text-right">
              Menampilkan {filteredReports.length} dari {recentReports.length} laporan
            </p>
          )}
        </CardContent>
      </Card>

      {/* Activity Log */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2"><CardTitle style={{ fontSize: "1.125rem" }}>Log Aktivitas Sistem</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {getLastLoginLogs().map((log, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                <div className={`p-1.5 rounded-full ${log.bgColor} ${log.textColor}`}><Activity className="w-4 h-4" /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="text-sm" style={{ fontWeight: 600 }}>{log.action}</h4>
                    <Badge variant="outline" className="text-xs">{log.user}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{log.details}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{log.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Button variant="outline" className={btnAnim}>Lihat Semua Catatan</Button>
          </div>
        </CardContent>
      </Card>

      <AddUserDialog
        open={isAddUserDialogOpen}
        onOpenChange={setIsAddUserDialogOpen}
        onSuccess={(createdUser) => {
          if (!createdUser) return;
          setFetchedUsers((prev) => [{ ...createdUser, _id: createdUser._id || createdUser.id }, ...prev]);
        }}
      />

      <Dialog open={Boolean(viewUser)} onOpenChange={(open) => { if (!open) setViewUser(null); }}>
        <DialogContent className="sm:max-w-[560px] w-[90vw]">
          <DialogHeader>
            <DialogTitle>Detail Pengguna</DialogTitle>
          </DialogHeader>
          {viewUser && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">Nama:</span> {getFullName(viewUser)}</div>
              <div><span className="text-muted-foreground">Email:</span> {viewUser.email || "-"}</div>
              <div><span className="text-muted-foreground">Peran:</span> {viewUser.role || "-"}</div>
              <div><span className="text-muted-foreground">Telepon:</span> {viewUser.phone || "-"}</div>
              <div><span className="text-muted-foreground">Lokasi Kerja:</span> {viewUser.workLocation || "-"}</div>
              <div><span className="text-muted-foreground">Terakhir Login:</span> {viewUser.lastLoginAt ? new Date(viewUser.lastLoginAt).toLocaleString("id-ID") : "-"}</div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewUser(null)}>Tutup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editUser)} onOpenChange={(open) => { if (!open) setEditUser(null); }}>
        <DialogContent className="sm:max-w-[560px] w-[90vw]">
          <DialogHeader>
            <DialogTitle>Edit Akun Pengguna</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Nama Depan</Label>
                <Input value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Nama Tengah (Opsional)</Label>
                <Input value={editForm.middleName} onChange={(e) => setEditForm((p) => ({ ...p, middleName: e.target.value }))} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-sm">Nama Belakang</Label>
                <Input value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-sm">Email</Label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Telepon</Label>
                <Input value={editForm.phone} onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Lokasi Kerja</Label>
                <Input value={editForm.workLocation} onChange={(e) => setEditForm((p) => ({ ...p, workLocation: e.target.value }))} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label className="text-sm">Peran</Label>
                {isSuperadmin ? (
                  <Select value={editForm.role} onValueChange={(v) => setEditForm((p) => ({ ...p, role: v }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih peran" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="officer">Petugas</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="superadmin">Superadmin</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={editForm.role} disabled />
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={savingEditUser} onClick={() => setEditUser(null)}>Batal</Button>
            <Button disabled={savingEditUser} onClick={() => void handleSaveEditUser()}>{savingEditUser ? "Menyimpan..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
