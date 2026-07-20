import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

export type Role = "superadmin" | "admin" | "officer";

export interface ITrackingMonthStat {
  month: number;
  count: number;
}

export interface ITrackingYearStat {
  year: string;
  totalUniqueElderly: number;
  monthlyCounts: ITrackingMonthStat[];
  updatedAt?: string;
}

export interface ITrackingStats {
  yearly: ITrackingYearStat[];
  updatedAt?: string;
}

export interface IUser {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  email: string;
  role: Role;
  profilePicture?: string;
  phone?: string;
  workLocation?: string;
  createdAt?: string;
  lastLoginAt?: string;
  lastLoginIP?: string;
  lastUserAgent?: string;
  trackingStats?: ITrackingStats;
}

export function useAuth() {
  const [user, setUser] = useState<IUser | null>(() => {
    const cached = localStorage.getItem("user");
    try { return cached ? JSON.parse(cached) : null; } catch { return null; }
  });

  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const isAuthed = useMemo(() => Boolean(user), [user]);

  const persist = useCallback((u: IUser | null) => {
    if (u) {
      localStorage.setItem("user", JSON.stringify(u));
    } else {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
    }

    setUser(u);
  }, []);

  function normalizeUser(raw: any): IUser | null {
    if (!raw) return null;

    const id = String(raw.id ?? raw._id ?? "").trim();
    if (!id) return null;

    return {
      id,
      firstName: String(raw.firstName ?? "").trim(),
      middleName: String(raw.middleName ?? "").trim(),
      lastName: String(raw.lastName ?? "").trim(),
      email: String(raw.email ?? "").trim(),
      role: String(raw.role ?? "officer").toLowerCase() as Role,
      profilePicture: String(raw.profilePicture ?? "").trim(),
      phone: String(raw.phone ?? "").trim(),
      workLocation: String(raw.workLocation ?? "").trim(),
      createdAt: raw.createdAt,
      lastLoginAt: raw.lastLoginAt,
      lastLoginIP: raw.lastLoginIP,
      lastUserAgent: raw.lastUserAgent,
      trackingStats: {
        yearly: Array.isArray(raw.trackingStats?.yearly)
          ? raw.trackingStats.yearly
              .map((entry: any) => ({
                year: String(entry?.year ?? "").trim(),
                totalUniqueElderly: Number(entry?.totalUniqueElderly ?? 0),
                monthlyCounts: Array.isArray(entry?.monthlyCounts)
                  ? entry.monthlyCounts
                      .map((monthEntry: any) => ({
                        month: Number(monthEntry?.month ?? 0),
                        count: Number(monthEntry?.count ?? 0),
                      }))
                      .filter((monthEntry: ITrackingMonthStat) => monthEntry.month >= 1 && monthEntry.month <= 12)
                      .sort((a: ITrackingMonthStat, b: ITrackingMonthStat) => a.month - b.month)
                  : [],
                updatedAt: entry?.updatedAt,
              }))
              .filter((entry: ITrackingYearStat) => Boolean(entry.year))
              .sort((a: ITrackingYearStat, b: ITrackingYearStat) => b.year.localeCompare(a.year))
          : [],
        updatedAt: raw.trackingStats?.updatedAt,
      },
    };
  }

  function extractUser(payload: any): IUser | null {
    if (!payload) return null;
    if (payload.user) return normalizeUser(payload.user);
    return normalizeUser(payload);
  }

  const login = useCallback(async (email: string, password: string, remember = false) => {
    setLoading(true);
    try {
      await api.post("/auth/login", { email, password, remember });
      const { data } = await api.get("/auth/me");
      const nextUser = extractUser(data);
      persist(nextUser);
      setReady(true);
      return { ok: true };
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = status === 401 || status === 403
        ? "Email atau password salah."
        : e?.response?.data?.message || e?.message || "Gagal masuk";
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, [persist]);

  const fetchMe = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/auth/me");
      const nextUser = extractUser(data);
      if (!nextUser) {
        persist(null);
      } else {
        persist(nextUser);
      }
    } catch {
      persist(null);
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [persist]);

  const updateProfile = useCallback(async (payload: Partial<Pick<IUser, "firstName" | "middleName" | "lastName" | "phone" | "workLocation">>) => {
    setLoading(true);
    try {
      const { data } = await api.put("/users/me", payload);
      const nextUser = extractUser(data);
      persist(nextUser);
      return { ok: true, user: nextUser };
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "Gagal memperbarui";
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, [persist]);

  const uploadAvatar = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("avatar", file);
      const { data } = await api.post("/users/me/avatar", form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const nextUser = extractUser(data);
      persist(nextUser);
      return { ok: true, user: nextUser };
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || "Gagal mengunggah";
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, [persist]);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      console.warn("Logout request failed:", error);
    } finally {
      persist(null);
      setReady(true);
      window.dispatchEvent(new Event("auth-logout"));
    }
  }, [persist]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  return { user, isAuthed, loading, ready, login, fetchMe, updateProfile, uploadAvatar, logout };
}
