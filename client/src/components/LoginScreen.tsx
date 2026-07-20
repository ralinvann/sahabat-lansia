import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Heart, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { api } from "../lib/api";

type View = "login" | "forgot" | "reset";

interface LoginScreenProps {
  onLogin: (email: string, password: string, remember: boolean) => Promise<{ ok: boolean; message?: string }>;
  onBack?: () => void;
  onGuest?: () => void;
}

export function LoginScreen({ onLogin, onBack, onGuest }: LoginScreenProps) {
  const [view, setView] = useState<View>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [rememberDevice, setRememberDevice] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Forgot password state
  const [forgotEmail, setForgotEmail] = useState("");

  // Reset password state
  const [resetToken, setResetToken] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Check URL for reset token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("resetToken");
    const email = params.get("email");
    if (token && email) {
      setResetToken(token);
      setResetEmail(email);
      setView("reset");
      // Clean up the URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const clearMessages = () => {
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleChange =
    (field: "email" | "password") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData((s) => ({ ...s, [field]: e.target.value }));
    };

  const handleSubmit = async (): Promise<void> => {
    clearMessages();
    if (!formData.email || !formData.password) {
      setErrorMsg("Email dan password wajib diisi.");
      return;
    }
    setSubmitting(true);
    const res = await onLogin(formData.email, formData.password, rememberDevice);
    setSubmitting(false);
    if (!res.ok) {
      setErrorMsg(res.message || "Login gagal.");
      return;
    }
    setSuccessMsg("Berhasil masuk.");
  };

  const handleForgotPassword = async (): Promise<void> => {
    clearMessages();
    if (!forgotEmail) {
      setErrorMsg("Email wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/auth/forgot-password", { email: forgotEmail });
      setSuccessMsg(res.data.message || "Tautan reset password telah dikirim ke email Anda.");
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || "Gagal mengirim email reset password.");
    }
    setSubmitting(false);
  };

  const handleResetPassword = async (): Promise<void> => {
    clearMessages();
    if (!newPassword || !confirmPassword) {
      setErrorMsg("Password baru dan konfirmasi wajib diisi.");
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg("Password minimal 6 karakter.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg("Password dan konfirmasi tidak cocok.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post("/auth/reset-password", {
        token: resetToken,
        email: resetEmail,
        newPassword,
      });
      setSuccessMsg(res.data.message || "Password berhasil direset.");
      // Switch back to login after short delay
      setTimeout(() => {
        setView("login");
        clearMessages();
        setSuccessMsg("Password berhasil direset. Silakan masuk.");
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || "Gagal mereset password.");
    }
    setSubmitting(false);
  };

  const switchToForgot = () => {
    clearMessages();
    setForgotEmail(formData.email);
    setView("forgot");
  };

  const switchToLogin = () => {
    clearMessages();
    setView("login");
  };

  // ─── Forgot Password View ─────────────────────────────────────────────
  if (view === "forgot") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center p-6">
        <div className="w-full max-w-md mx-auto">
          <Card className="shadow-xl border-2 border-primary/20">
            <CardHeader className="text-center space-y-4 relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={switchToLogin}
                className="absolute left-2 top-2 transition-all duration-200 hover:scale-110 active:scale-95"
                disabled={submitting}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="mx-auto w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center">
                <Mail className="w-7 h-7 text-primary" />
              </div>
              <CardTitle style={{ fontSize: "1.5rem" }}>Lupa Kata Sandi</CardTitle>
              <CardDescription>
                Masukkan email Anda untuk menerima tautan reset kata sandi
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {errorMsg && <div className="text-red-600 text-center text-sm">{errorMsg}</div>}
              {successMsg && <div className="text-primary text-center text-sm">{successMsg}</div>}

              <div className="space-y-4">
                <Input
                  type="email"
                  placeholder="Email"
                  className="h-11 border border-border focus:border-primary"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  disabled={submitting}
                />

                <Button
                  onClick={() => void handleForgotPassword()}
                  className="w-full h-12 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  disabled={submitting}
                >
                  {submitting ? "Mengirim..." : "Kirim Tautan Reset"}
                </Button>

                <div className="text-center">
                  <Button
                    variant="link"
                    className="text-muted-foreground"
                    onClick={switchToLogin}
                    disabled={submitting}
                  >
                    Kembali ke Masuk
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Reset Password View ──────────────────────────────────────────────
  if (view === "reset") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center p-6">
        <div className="w-full max-w-md mx-auto">
          <Card className="shadow-xl border-2 border-primary/20">
            <CardHeader className="text-center space-y-4">
              <div className="mx-auto w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center">
                <Heart className="w-7 h-7 text-primary" />
              </div>
              <CardTitle style={{ fontSize: "1.5rem" }}>Reset Kata Sandi</CardTitle>
              <CardDescription>
                Buat kata sandi baru untuk akun <strong>{resetEmail}</strong>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {errorMsg && <div className="text-red-600 text-center text-sm">{errorMsg}</div>}
              {successMsg && <div className="text-primary text-center text-sm">{successMsg}</div>}

              <div className="space-y-4">
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Kata Sandi Baru"
                    className="h-11 border border-border focus:border-primary pr-12"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={submitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 transition-all duration-200 hover:scale-110 active:scale-95"
                    onClick={() => setShowNewPassword((s) => !s)}
                    disabled={submitting}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>

                <Input
                  type="password"
                  placeholder="Konfirmasi Kata Sandi Baru"
                  className="h-11 border border-border focus:border-primary"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting}
                />

                <Button
                  onClick={() => void handleResetPassword()}
                  className="w-full h-12 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  disabled={submitting}
                >
                  {submitting ? "Memproses..." : "Reset Kata Sandi"}
                </Button>

                <div className="text-center">
                  <Button
                    variant="link"
                    className="text-muted-foreground"
                    onClick={switchToLogin}
                    disabled={submitting}
                  >
                    Kembali ke Masuk
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Login View (default) ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary flex items-center justify-center p-6">
      <div className="w-full max-w-md mx-auto">
        <Card className="shadow-xl border-2 border-primary/20">
          <CardHeader className="text-center space-y-4 relative">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                className="absolute left-2 top-2 transition-all duration-200 hover:scale-110 active:scale-95"
                disabled={submitting}
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div className="mx-auto w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center">
              <Heart className="w-7 h-7 text-primary" />
            </div>
            <CardTitle style={{ fontSize: "1.5rem" }}>Sahabat Lansia</CardTitle>
            <CardDescription>Sistem Monitoring Kesehatan Lansia</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMsg && <div className="text-red-600 text-center text-sm">{errorMsg}</div>}
            {successMsg && <div className="text-primary text-center text-sm">{successMsg}</div>}

            <div className="space-y-4">
              <Input
                id="email"
                type="email"
                placeholder="Email"
                className="h-11 border border-border focus:border-primary"
                value={formData.email}
                onChange={handleChange("email")}
                disabled={submitting}
              />

              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Kata Sandi"
                  className="h-11 border border-border focus:border-primary pr-12"
                  value={formData.password}
                  onChange={handleChange("password")}
                  disabled={submitting}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 transition-all duration-200 hover:scale-110 active:scale-95"
                  onClick={() => setShowPassword((s) => !s)}
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="remember"
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  disabled={submitting}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="remember" className="text-sm text-muted-foreground">
                  Percayai perangkat ini selama 30 hari
                </label>
              </div>

              <Button
                onClick={() => void handleSubmit()}
                className="w-full h-12 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                disabled={submitting}
              >
                {submitting ? "Memproses..." : "Masuk ke Sistem"}
              </Button>

              <div className="text-center">
                <Button
                  variant="link"
                  className="text-muted-foreground"
                  onClick={switchToForgot}
                  disabled={submitting}
                >
                  Lupa Kata Sandi?
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t border-border">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">atau akses sebagai tamu (akses terbatas)</p>
                <Button
                  variant="outline"
                  className="w-full h-10 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                  onClick={onGuest}
                  disabled={submitting}
                >
                  Kembali ke Home
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
