import { useEffect, useState } from "react";
import { Navigation } from "./components/Navigation";
import { LoginScreen } from "./components/LoginScreen";
import { Dashboard } from "./components/Dashboard";
import { UploadPage } from "./components/UploadPage";
import { PreviewEditPage } from "./components/PreviewEditPage";
import { UserProfile } from "./components/UserProfile";
import { AdminPage } from "./components/AdminPage";
import { UploadedDataViewPage } from "./components/UploadedDataViewPage";
import { useAuth } from "./hooks/useAuth";

export default function App() {
  const { user, isAuthed, ready, loading, login, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState("dashboard");
  const [previewData, setPreviewData] = useState<any>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Force login page when opening reset-password links from email.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("resetToken");
    const email = params.get("email");
    if (token && email) {
      setCurrentPage("login");
    }
  }, []);

  useEffect(() => {
    if (!ready || loading) return;

    const protectedPages = ["upload", "preview", "account", "users", "uploaded-data-view"];
    if (
      !isAuthed &&
      currentPage !== "login" &&
      protectedPages.includes(currentPage)
    ) {
      setCurrentPage("login");
    }
  }, [ready, loading, isAuthed, currentPage]);

  useEffect(() => {
    const handler = () => {
      try {
        const raw = sessionStorage.getItem("previewData");
        if (!raw) return;
        const parsed = JSON.parse(raw);

        setPreviewData(parsed);
        setCurrentPage("preview");
      } catch (e) {
        console.warn("preview-ready handler parse failed", e);
      }
    };

    window.addEventListener("preview-ready", handler);
    return () => window.removeEventListener("preview-ready", handler);
  }, []);

  const handlePageChange = (page: string) => {
    const protectedPages = ["upload", "preview", "account", "users", "uploaded-data-view"];
    if (protectedPages.includes(page) && !isAuthed) {
      setCurrentPage("login");
    } else {
      setCurrentPage(page);
    }
  };

  const handleLogout = async () => {
    await logout();
    setCurrentPage("login");
  };

  const renderCurrentPage = () => {
    if (!ready || loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-lg">Memuat...</p>
          </div>
        </div>
      );
    }

    switch (currentPage) {
      case "login":
        return (
          <LoginScreen
            onLogin={async (email, password, remember) => {
              const result = await login(email, password, remember);
              if (result.ok) setCurrentPage("dashboard");
              return result;
            }}
            onBack={() => setCurrentPage("dashboard")}
            onGuest={() => setCurrentPage("dashboard")}
          />
        );

      case "dashboard":
        return (
          <Dashboard
            userStatus={isAuthed ? "authenticated" : "guest"}
            onLoginClick={() => setCurrentPage("login")}
          />
        );

      case "upload":
        return (
          <UploadPage
            onNavigate={(page, state) => {
              if (page === "preview") {
                setPreviewData(state?.data ?? null);
                setCurrentPage("preview");
              } else {
                setCurrentPage(page);
              }
            }}
          />
        );

      case "preview":
        return (
          <PreviewEditPage
            initialData={previewData}
            onDone={() => setCurrentPage("dashboard")}
            onCancel={() => setCurrentPage("upload")}
          />
        );

      case "account":
        return <UserProfile />;

      case "users":
        if (user?.role !== "admin" && user?.role !== "superadmin") {
          return (
            <Dashboard
              userStatus={isAuthed ? "authenticated" : "guest"}
              onLoginClick={() => setCurrentPage("login")}
            />
          );
        }
        return (
          <AdminPage
            onNavigate={(page, state) => {
              if (page === "uploaded-data-view") {
                setSelectedReportId(state?.reportId || null);
                setCurrentPage("uploaded-data-view");
                return;
              }
              setCurrentPage(page);
            }}
          />
        );

      case "uploaded-data-view":
        if (user?.role !== "admin" && user?.role !== "superadmin") {
          return (
            <Dashboard
              userStatus={isAuthed ? "authenticated" : "guest"}
              onLoginClick={() => setCurrentPage("login")}
            />
          );
        }
        return (
          <UploadedDataViewPage
            reportId={selectedReportId}
            onBack={() => setCurrentPage("users")}
          />
        );

      case "help":
        return (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-3xl font-semibold">Bantuan Penggunaan Aplikasi</h2>
              <p className="text-base text-muted-foreground mt-2">
                Panduan ini dibuat untuk membantu petugas puskesmas, kader, dan admin di lapangan
                agar dapat menggunakan aplikasi dengan cepat, termasuk saat jaringan internet tidak stabil.
              </p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
                <h3 className="text-xl font-semibold">1) Alur Kerja Harian (Paling Sering Dipakai)</h3>
                <ol className="list-decimal ml-5 space-y-2 text-sm leading-6">
                  <li>Buka menu <strong>Upload</strong> untuk memasukkan data bulan berjalan.</li>
                  <li>Pilih file sesuai format, lalu tekan <strong>Upload</strong>.</li>
                  <li>Masuk ke halaman <strong>Preview/Edit</strong> untuk cek data yang salah/kurang.</li>
                  <li>Perbaiki data, lalu simpan.</li>
                  <li>Lihat ringkasan di <strong>Dashboard</strong> untuk memantau hasil input.</li>
                  <li>Jika perlu laporan, gunakan menu unduh laporan tahunan/bulanan.</li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  Tips: Setelah upload, selalu cek beberapa baris pertama dan terakhir agar kesalahan format cepat terlihat.
                </p>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
                <h3 className="text-xl font-semibold">2) Persiapan Sebelum Upload</h3>
                <ul className="list-disc ml-5 space-y-2 text-sm leading-6">
                  <li>Pastikan nama kolom sesuai pedoman format data dari dinas/puskesmas.</li>
                  <li>Jangan ubah urutan kolom penting seperti nama, umur, alamat, dan NIK.</li>
                  <li>Gunakan penulisan yang konsisten (misal: L/P, Ya/Tidak).</li>
                  <li>Simpan file dengan nama yang jelas, contoh: <strong>lansia_april_2026.xlsx</strong>.</li>
                  <li>Hindari sel kosong pada kolom wajib.</li>
                </ul>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
                <h3 className="text-xl font-semibold">3) Jika Internet Lambat atau Putus-putus</h3>
                <ul className="list-disc ml-5 space-y-2 text-sm leading-6">
                  <li>Lakukan upload saat sinyal paling stabil (biasanya pagi atau malam).</li>
                  <li>Jika gagal upload, jangan panik: cek koneksi lalu ulangi 1 kali.</li>
                  <li>Kurangi aplikasi lain yang menggunakan internet saat upload.</li>
                  <li>Jika tetap gagal, simpan file dan kirim ke petugas admin kabupaten untuk bantuan.</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Catatan: Data di perangkat tidak otomatis hilang saat jaringan putus, tetapi proses kirim bisa gagal.
                </p>
              </div>

              <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
                <h3 className="text-xl font-semibold">4) Masalah Umum dan Solusi Cepat</h3>
                <div className="space-y-3 text-sm leading-6">
                  <p><strong>Tidak bisa login:</strong> cek email/password, pastikan huruf besar-kecil benar.</p>
                  <p><strong>Lupa password:</strong> klik "Lupa Password", buka email, lalu reset password.</p>
                  <p><strong>Data tidak muncul:</strong> muat ulang halaman, lalu cek bulan/tahun data.</p>
                  <p><strong>Angka laporan aneh:</strong> periksa duplikasi NIK, umur, dan kolom skrining.</p>
                  <p><strong>Upload ditolak:</strong> pastikan format file sesuai template.</p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md space-y-3">
              <h3 className="text-xl font-semibold">5) Keamanan Akun</h3>
              <ul className="list-disc ml-5 space-y-2 text-sm leading-6">
                <li>Jangan bagikan password ke orang lain, termasuk lewat chat grup.</li>
                <li>Ganti password secara berkala di menu <strong>Profil</strong> &gt; <strong>Ganti Password</strong>.</li>
                <li>Setelah selesai kerja di komputer umum, selalu logout.</li>
              </ul>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-md space-y-3">
              <h3 className="text-xl font-semibold">6) Kontak Bantuan</h3>
              <p className="text-sm leading-6">
                Jika mengalami kendala yang tidak bisa diselesaikan, hubungi admin/superadmin setempat.
                Sertakan informasi berikut agar bantuan lebih cepat:
              </p>
              <ul className="list-disc ml-5 space-y-2 text-sm leading-6">
                <li>Nama puskesmas dan nama petugas</li>
                <li>Waktu kejadian</li>
                <li>Langkah yang dilakukan sebelum error</li>
                <li>Screenshot pesan error (jika ada)</li>
              </ul>
              <div className="text-sm text-muted-foreground">
                Email dukungan: sahabatlansia.care@gmail.com
              </div>
            </div>
          </div>
        );

      default:
        return (
          <Dashboard
            userStatus={isAuthed ? "authenticated" : "guest"}
            onLoginClick={() => setCurrentPage("login")}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {currentPage !== "login" && (
        <Navigation
          currentPage={currentPage}
          onPageChange={handlePageChange}
          isAuthed={isAuthed}
          userRole={user?.role}
          onShowLogin={() => setCurrentPage("login")}
          onLogout={() => void handleLogout()}
        />
      )}
      <main className={currentPage === "login" ? "" : "max-w-7xl mx-auto"}>
        {renderCurrentPage()}
      </main>
    </div>
  );
}
