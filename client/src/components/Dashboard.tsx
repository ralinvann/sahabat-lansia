import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Alert, AlertDescription } from "./ui/alert";
import {
  Users,
  TrendingUp,
  Lock,
  Eye,
  Download,
  RotateCw,
  ClipboardCheck,
  BarChart3,
  MapPin,
  Calendar,
  ShieldCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { api } from "../lib/api";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

interface DashboardProps {
  userStatus: "guest" | "authenticated";
  onLoginClick?: () => void;
}

const MONTHS = [
  { value: "JANUARI", label: "Januari" },
  { value: "FEBRUARI", label: "Februari" },
  { value: "MARET", label: "Maret" },
  { value: "APRIL", label: "April" },
  { value: "MEI", label: "Mei" },
  { value: "JUNI", label: "Juni" },
  { value: "JULI", label: "Juli" },
  { value: "AGUSTUS", label: "Agustus" },
  { value: "SEPTEMBER", label: "September" },
  { value: "OKTOBER", label: "Oktober" },
  { value: "NOVEMBER", label: "November" },
  { value: "DESEMBER", label: "Desember" },
];

interface DashboardData {
  totalReports?: number;
  totalRowsScanned?: number;
  validRowsScanned?: number;
  totalPraLansia: number;
  totalLansia: number;
  totalLansiaRisti: number;
  screenedLansia: number;
  empowermentCount: number;
  independenceLevels: { A: number; B: number; C: number };
  genderBreakdown: { male: number; female: number };
  lastUpdated?: string;
  puskesmasCount?: number;
  desaCount?: number;
}

const defaultDashboardData: DashboardData = {
  totalReports: 0,
  totalRowsScanned: 0,
  validRowsScanned: 0,
  totalPraLansia: 0,
  totalLansia: 0,
  totalLansiaRisti: 0,
  screenedLansia: 0,
  empowermentCount: 0,
  independenceLevels: { A: 0, B: 0, C: 0 },
  genderBreakdown: { male: 0, female: 0 },
  lastUpdated: "",
  puskesmasCount: 0,
  desaCount: 0,
};

function compactNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

function percent(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function percentValue(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

const CHART_COLORS = {
  primary: "var(--chart-1)",
  secondary: "var(--chart-2)",
  tertiary: "var(--chart-3)",
  quaternary: "var(--chart-4)",
  muted: "var(--chart-5)",
};

export function Dashboard({ userStatus, onLoginClick }: DashboardProps) {
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"monthly" | "annual">("monthly");
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [reportExists, setReportExists] = useState<boolean | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData>(defaultDashboardData);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => (currentYear - i).toString());

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      setDashboardError(null);
      try {
        const { data } = await api.get<DashboardData>("/lwreports/dashboard");
        setDashboardData(data);
      } catch {
        try {
          const { data } = await api.get<DashboardData>("/elderly-reports/dashboard");
          setDashboardData(data);
        } catch (e: any) {
          const msg = e?.response?.data?.message || "Gagal loading data dashboard.";
          setDashboardError(msg);
          setDashboardData(defaultDashboardData);
        }
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, []);

  const totalElderlyRecorded = dashboardData.totalPraLansia + dashboardData.totalLansia;
  const serviceCoverageData = [
    { name: "Skrining", value: dashboardData.screenedLansia, fill: CHART_COLORS.primary },
    { name: "Pemberdayaan", value: dashboardData.empowermentCount, fill: CHART_COLORS.secondary },
  ];

  const totalGender = dashboardData.genderBreakdown.male + dashboardData.genderBreakdown.female;
  const malePercent = percentValue(dashboardData.genderBreakdown.male, totalGender);
  const femalePercent = 100 - malePercent;
  const genderChartData = [
    { name: "Laki-laki", value: dashboardData.genderBreakdown.male, fill: CHART_COLORS.primary },
    { name: "Perempuan", value: dashboardData.genderBreakdown.female, fill: CHART_COLORS.secondary },
  ];
  const totalIndependence = dashboardData.independenceLevels.A + dashboardData.independenceLevels.B + dashboardData.independenceLevels.C;

  const receivedBoth = Math.min(dashboardData.screenedLansia, dashboardData.empowermentCount);
  const receivedOne = Math.abs(dashboardData.screenedLansia - dashboardData.empowermentCount);
  const receivedNone = Math.max(0, totalElderlyRecorded - dashboardData.screenedLansia - receivedOne);

  const serviceDistributionData = [
    { name: "Kedua Layanan", value: receivedBoth, fill: CHART_COLORS.primary },
    { name: "Satu Layanan", value: receivedOne, fill: CHART_COLORS.tertiary },
    { name: "Belum Dilayani", value: receivedNone, fill: CHART_COLORS.muted },
  ];

  const atLeastOneServicePercentage = percentValue(totalElderlyRecorded - receivedNone, totalElderlyRecorded);
  const bothServicesPercentage = percentValue(receivedBoth, totalElderlyRecorded);
  const totalServiceInteractions = dashboardData.screenedLansia + dashboardData.empowermentCount;

  const handleDialogOpen = () => {
    setShowReportDialog(true);
    setDialogMode("monthly");
    setSelectedMonth("");
    setSelectedYear(currentYear.toString());
    setReportExists(null);
    setReportId(null);
    setErrorMsg(null);
  };

  const triggerBlobDownload = (data: BlobPart, fileName: string) => {
    const url = window.URL.createObjectURL(new Blob([data]));
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    link.parentNode?.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadAnnual = async () => {
    if (!selectedYear) { setErrorMsg("Pilih tahun terlebih dahulu."); return; }
    setDownloadLoading(true);
    setErrorMsg(null);
    try {
      const responseA = await api.get(
        `/elderly-reports/annual/${selectedYear}/report-a`,
        { responseType: "blob" },
      );
      triggerBlobDownload(responseA.data, `Laporan_A_${selectedYear}.xlsx`);

      const responseB = await api.get(
        `/elderly-reports/annual/${selectedYear}/report-b`,
        { responseType: "blob" },
      );
      triggerBlobDownload(responseB.data, `Laporan_B_${selectedYear}.xlsx`);
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.message || e?.message || "Gagal mengunduh laporan.");
    } finally {
      setDownloadLoading(false);
    }
  };

  const handleSearchReport = async () => {
    if (!selectedMonth || !selectedYear) {
      setErrorMsg("Pilih bulan dan tahun terlebih dahulu.");
      return;
    }
    setSearching(true);
    setErrorMsg(null);
    setReportId(null);
    try {
      const bulanTahun = `${selectedMonth} ${selectedYear}`;
      const { data } = await api.get("/elderly-reports");
      const matchingReport = data.items?.find((report: any) => {
        const reportBulanTahun = String(report.bulanTahun || "").trim();
        return reportBulanTahun.toUpperCase() === bulanTahun.toUpperCase();
      });
      if (matchingReport) {
        setReportId(matchingReport._id);
        setReportExists(true);
      } else {
        setReportExists(false);
        setReportId(null);
      }
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.message || e?.message || "Gagal mencari laporan.");
      setReportExists(null);
    } finally {
      setSearching(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!reportId) { setErrorMsg("Laporan tidak ditemukan."); return; }
    setDownloadLoading(true);
    setErrorMsg(null);
    try {
      const response = await api.get(`/elderly-reports/${reportId}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Laporan_Bulanan_${selectedMonth}_${selectedYear}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      setShowReportDialog(false);
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.message || e?.message || "Gagal mengunduh laporan.");
    } finally {
      setDownloadLoading(false);
    }
  };

  function getProgressColor(value: number): string {
    if (value >= 70) return CHART_COLORS.primary;
    if (value >= 40) return CHART_COLORS.tertiary;
    return CHART_COLORS.quaternary;
  }

  const btnAnim = "transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]";

  return (
    <div className="p-6 space-y-6">
      {userStatus === "guest" && (
        <Alert className="bg-primary/10 border-primary/20">
          <Eye className="h-4 w-4 text-primary" />
          <AlertDescription className="text-sm">
            Anda sedang dalam mode tamu. Beberapa data dibatasi untuk melindungi privasi pasien.
            <Button variant="link" className="p-0 h-auto ml-1 text-primary" onClick={() => onLoginClick?.()}>
              Masuk untuk akses penuh
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {dashboardError && (
        <Alert className="bg-red-50 border-red-200">
          <AlertDescription className="text-red-700 text-sm">{dashboardError}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Home Utama</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ringkasan aktivitas kesehatan lansia hari ini
            {userStatus === "guest" && (
              <Badge variant="outline" className="ml-2 text-xs">
                <Eye className="w-3 h-3 mr-1" />
                Tampilan Tamu
              </Badge>
            )}
          </p>
        </div>
        <Button
          disabled={userStatus === "guest"}
          onClick={handleDialogOpen}
          className={`gap-2 ${btnAnim}`}
        >
          <Download className="w-4 h-4" />
          Unduh Laporan
          {userStatus === "guest" && <Lock className="w-3 h-3 ml-1" />}
        </Button>
      </div>

      {/* Coverage Info Strip */}
      {!loading && ((dashboardData.puskesmasCount ?? 0) > 0 || (dashboardData.desaCount ?? 0) > 0 || dashboardData.lastUpdated) && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground border-b pb-3">
          {(dashboardData.puskesmasCount ?? 0) > 0 && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <strong className="text-foreground">{dashboardData.puskesmasCount}</strong> puskesmas aktif
            </span>
          )}
          {(dashboardData.desaCount ?? 0) > 0 && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              <strong className="text-foreground">{dashboardData.desaCount}</strong> desa terlayani
            </span>
          )}
          {dashboardData.lastUpdated && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Terakhir diperbarui: <strong className="text-foreground ml-1">{dashboardData.lastUpdated}</strong>
            </span>
          )}
        </div>
      )}

      {/* Age Group Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="shadow-sm border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Pra-Lansia (45-59 thn)</p>
            <p className="text-2xl text-primary" style={{ fontWeight: 700 }}>{loading ? "..." : compactNumber(dashboardData.totalPraLansia)}</p>
            <p className="text-xs text-muted-foreground mt-1">orang terdaftar</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Lansia (≥60 thn)</p>
            <p className="text-2xl text-primary" style={{ fontWeight: 700 }}>{loading ? "..." : compactNumber(dashboardData.totalLansia)}</p>
            <p className="text-xs text-muted-foreground mt-1">orang terdaftar</p>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-l-4 border-l-primary">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Lansia Risti (≥70 thn)</p>
            <p className="text-2xl text-primary" style={{ fontWeight: 700 }}>{loading ? "..." : compactNumber(dashboardData.totalLansiaRisti)}</p>
            <p className="text-xs text-muted-foreground mt-1">risiko tinggi</p>
          </CardContent>
        </Card>
      </div>

      {/* Service Coverage */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2" style={{ fontSize: "1.125rem" }}>
            <BarChart3 className="w-5 h-5" />
            Cakupan Layanan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm mb-3" style={{ fontWeight: 500 }}>Total Layanan per Kategori</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={serviceCoverageData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {serviceCoverageData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="p-2.5 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground">Skrining</p>
                  <p style={{ fontWeight: 600, fontSize: "1.125rem" }}>{compactNumber(dashboardData.screenedLansia)}</p>
                </div>
                <div className="p-2.5 bg-primary/10 rounded-lg">
                  <p className="text-xs text-muted-foreground">Pemberdayaan</p>
                  <p style={{ fontWeight: 600, fontSize: "1.125rem" }}>{compactNumber(dashboardData.empowermentCount)}</p>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm mb-3" style={{ fontWeight: 500 }}>Distribusi Penerima Layanan</h3>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={serviceDistributionData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={5} dataKey="value">
                    {serviceDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                <div className="p-2 bg-muted rounded">
                  <p className="text-xs text-muted-foreground">Kedua</p>
                  <p style={{ fontWeight: 600 }}>{compactNumber(receivedBoth)}</p>
                </div>
                <div className="p-2 bg-primary/10 rounded">
                  <p className="text-xs text-muted-foreground">Satu</p>
                  <p style={{ fontWeight: 600 }}>{compactNumber(receivedOne)}</p>
                </div>
                <div className="p-2 bg-gray-100 rounded">
                  <p className="text-xs text-muted-foreground">Belum</p>
                  <p style={{ fontWeight: 600 }}>{compactNumber(receivedNone)}</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Program Impact */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2" style={{ fontSize: "1.125rem" }}>
            <TrendingUp className="w-5 h-5" />
            Dampak Program
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-sm">Lansia Menerima Minimal Satu Layanan</p>
                <span className="text-sm text-primary" style={{ fontWeight: 600 }}>
                  {atLeastOneServicePercentage}%
                </span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-500" style={{ width: `${atLeastOneServicePercentage}%`, backgroundColor: getProgressColor(atLeastOneServicePercentage) }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {compactNumber(totalElderlyRecorded - receivedNone)} dari {compactNumber(totalElderlyRecorded)} lansia
              </p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <p className="text-sm">Lansia Menerima Kedua Layanan</p>
                <span className="text-sm text-primary" style={{ fontWeight: 600 }}>
                  {bothServicesPercentage}%
                </span>
              </div>
              <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-500" style={{ width: `${bothServicesPercentage}%`, backgroundColor: getProgressColor(bothServicesPercentage) }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {compactNumber(receivedBoth)} dari {compactNumber(totalElderlyRecorded)} lansia
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-4 border-t">
              <div className="text-center p-3 bg-primary/10 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Cakupan Tinggi</p>
                <p className="text-primary" style={{ fontSize: "1.25rem", fontWeight: 700 }}>&ge; 70%</p>
                <p className="text-xs text-muted-foreground mt-1">Target Optimal</p>
              </div>
              <div className="text-center p-3 bg-primary/10 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Cakupan Sedang</p>
                <p className="text-primary" style={{ fontSize: "1.25rem", fontWeight: 700 }}>40-69%</p>
                <p className="text-xs text-muted-foreground mt-1">Perlu Peningkatan</p>
              </div>
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Cakupan Rendah</p>
                <p className="text-foreground" style={{ fontSize: "1.25rem", fontWeight: 700 }}>&lt; 40%</p>
                <p className="text-xs text-muted-foreground mt-1">Perlu Perhatian</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gender & Independence */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gender Breakdown */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ fontSize: "1rem" }}>
              <Users className="w-4 h-4" />
              Sebaran Jenis Kelamin
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totalGender > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={genderChartData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={4} dataKey="value">
                      {genderChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div className="p-2.5 bg-primary/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Laki-laki</p>
                    <p className="text-primary" style={{ fontWeight: 700, fontSize: "1.125rem" }}>{compactNumber(dashboardData.genderBreakdown.male)}</p>
                    <p className="text-xs text-muted-foreground">{malePercent}%</p>
                  </div>
                  <div className="p-2.5 bg-primary/10 rounded-lg text-center">
                    <p className="text-xs text-muted-foreground">Perempuan</p>
                    <p className="text-primary" style={{ fontWeight: 700, fontSize: "1.125rem" }}>{compactNumber(dashboardData.genderBreakdown.female)}</p>
                    <p className="text-xs text-muted-foreground">{femalePercent}%</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">Data belum tersedia</p>
            )}
          </CardContent>
        </Card>

        {/* Independence Levels */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2" style={{ fontSize: "1rem" }}>
              <ShieldCheck className="w-4 h-4" />
              Tingkat Kemandirian Lansia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 pt-1">
              {[
                { label: "Level A - Mandiri", value: dashboardData.independenceLevels.A, color: CHART_COLORS.primary },
                { label: "Level B - Perlu Bantuan", value: dashboardData.independenceLevels.B, color: CHART_COLORS.secondary },
                { label: "Level C - Ketergantungan", value: dashboardData.independenceLevels.C, color: CHART_COLORS.tertiary },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm">{label}</p>
                    <span className="text-sm" style={{ fontWeight: 600, color }}>
                      {compactNumber(value)} ({percent(value, totalIndependence)})
                    </span>
                  </div>
                  <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full transition-all duration-500" style={{ width: `${percentValue(value, totalIndependence)}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
              <div className="pt-2 border-t">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                  <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Total Interaksi Layanan</p>
                    <p style={{ fontWeight: 700 }}>{loading ? "..." : compactNumber(totalServiceInteractions)}</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Guest CTA */}
      {userStatus === "guest" && (
        <Card className="shadow-sm bg-gradient-to-r from-muted to-primary/10 border-border">
          <CardContent className="p-5">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white rounded-full shadow-sm">
                  <Lock className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }} className="mb-0.5">Akses Penuh Tersedia</h3>
                  <p className="text-sm text-muted-foreground">
                    Masuk untuk mengelola dan mengunggah data perawatan lansia bulanan
                  </p>
                </div>
              </div>
              <Button onClick={() => onLoginClick?.()} className={`gap-2 whitespace-nowrap ${btnAnim}`}>
                <Lock className="w-4 h-4" />
                Masuk Sekarang
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Report Download Dialog */}
      <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="space-y-2">
            <DialogTitle style={{ fontSize: "1.25rem" }}>Unduh Laporan</DialogTitle>
            <DialogDescription className="text-sm">
              Pilih jenis laporan yang ingin diunduh
            </DialogDescription>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-2 pt-2">
            <Button
              variant={dialogMode === "monthly" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => { setDialogMode("monthly"); setErrorMsg(null); setReportExists(null); }}
            >
              Laporan Bulanan
            </Button>
            <Button
              variant={dialogMode === "annual" ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => { setDialogMode("annual"); setErrorMsg(null); setReportExists(null); }}
            >
              Laporan Tahunan
            </Button>
          </div>

          {dialogMode === "monthly" && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm" style={{ fontWeight: 500 }}>Bulan</label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Pilih bulan..." />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month) => (
                      <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm" style={{ fontWeight: 500 }}>Tahun</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                {errorMsg && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{errorMsg}</div>
                )}
                {reportExists === null && (
                  <div className="p-3 bg-muted/50 border border-muted rounded-md text-sm text-muted-foreground text-center">
                    Pilih bulan dan tahun, lalu tekan "Cari Laporan"
                  </div>
                )}
                {reportExists === true && (
                  <div className="p-3 bg-primary/10 border border-primary/20 rounded-md text-sm text-primary flex items-center gap-2">
                    <span>&#10003;</span>
                    <span>Laporan tersedia dan siap untuk diunduh</span>
                  </div>
                )}
                {reportExists === false && (
                  <div className="p-3 bg-muted border border-border rounded-md text-sm text-muted-foreground flex items-center gap-2">
                    <span>&#9888;</span>
                    <span>Laporan untuk bulan {selectedMonth} {selectedYear} belum tersedia</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {dialogMode === "annual" && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm" style={{ fontWeight: 500 }}>Tahun</label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((year) => (
                      <SelectItem key={year} value={year}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-primary/10 border border-primary/20 rounded-md text-sm text-primary">
                Mengunduh dua file: <strong>Laporan A</strong> (rekap per desa) dan <strong>Laporan B</strong> (daftar individu), masing-masing berisi 12 sheet per bulan.
              </div>
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">{errorMsg}</div>
              )}
            </div>
          )}

          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className={`flex-1 ${btnAnim}`}
              onClick={() => setShowReportDialog(false)}
              disabled={searching || downloadLoading}
            >
              Batal
            </Button>

            {dialogMode === "monthly" && (
              <Button
                className={`${btnAnim} ${reportExists === true ? "bg-primary hover:bg-primary/90 text-white" : ""}`}
                onClick={reportExists === true ? handleDownloadReport : handleSearchReport}
                disabled={
                  reportExists === true
                    ? (!reportId || downloadLoading)
                    : (!selectedMonth || !selectedYear || searching || downloadLoading)
                }
              >
                {reportExists === true ? (
                  downloadLoading ? (
                    <><RotateCw className="w-4 h-4 mr-2 animate-spin" />Mengunduh...</>
                  ) : (
                    <><Download className="w-4 h-4 mr-2" />Unduh Laporan Excel</>
                  )
                ) : (
                  searching ? (
                    <><RotateCw className="w-4 h-4 mr-2 animate-spin" />Mencari...</>
                  ) : "Cari Laporan"
                )}
              </Button>
            )}

            {dialogMode === "annual" && (
              <Button
                className={`flex-1 ${btnAnim}`}
                onClick={handleDownloadAnnual}
                disabled={!selectedYear || downloadLoading}
              >
                {downloadLoading ? (
                  <><RotateCw className="w-4 h-4 mr-2 animate-spin" />Mengunduh 2 file...</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" />Unduh Laporan A & B</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
