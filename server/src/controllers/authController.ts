import { CookieOptions, Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User";
import cloudinary from "../config/cloudinary";
import { requireAuth } from "../middleware/auth";
import { logActivity } from "../utils/activityLogger";
import { sendEmail } from "../utils/sendEmail";
import { recomputeWorkerTrackingStats } from "../utils/workerTrackingStats";

function serializeTrackingStats(trackingStats: any) {
  const yearly = Array.isArray(trackingStats?.yearly)
    ? trackingStats.yearly.map((entry: any) => ({
        year: String(entry?.year ?? "").trim(),
        totalUniqueElderly: Number(entry?.totalUniqueElderly ?? 0),
        monthlyCounts: Array.isArray(entry?.monthlyCounts)
          ? entry.monthlyCounts
              .map((monthEntry: any) => ({
                month: Number(monthEntry?.month ?? 0),
                count: Number(monthEntry?.count ?? 0),
              }))
              .filter((monthEntry: { month: number; count: number }) => monthEntry.month >= 1 && monthEntry.month <= 12)
              .sort((a: { month: number; count: number }, b: { month: number; count: number }) => a.month - b.month)
          : [],
        updatedAt: entry?.updatedAt,
      }))
      .filter((entry: { year: string }) => Boolean(entry.year))
      .sort((a: { year: string }, b: { year: string }) => b.year.localeCompare(a.year))
    : [];

  return {
    yearly,
    updatedAt: trackingStats?.updatedAt,
  };
}

const JWT_SECRET = process.env.JWT_SECRET || "devsecret";

function shouldUseSecureCookies(req: Request): boolean {
  const forwardedProto = req.get("x-forwarded-proto");
  return req.secure || forwardedProto === "https" || req.hostname.endsWith(".onrender.com");
}

function getAuthCookieOptions(req: Request, maxAge: number): CookieOptions {
  const useSecureCookies = shouldUseSecureCookies(req);

  return {
    httpOnly: true,
    sameSite: useSecureCookies ? "none" : "lax",
    secure: useSecureCookies,
    maxAge,
    path: "/",
  };
}

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const signup = async (req: Request, res: Response): Promise<void> => {
  const { firstName, middleName, lastName, email, password, profilePicture, phone, workLocation } = req.body;
  const normalizedEmail = normalizeEmail(email);

  try {
    const existing = await User.findOne({ email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i") });
    if (existing) {
      res.status(409).json({ message: "User already exists" });
      return;
    }

    let uploadedPicture = "";
    if (profilePicture) {
      const uploadRes = await cloudinary.uploader.upload(uploadedPicture, {
        folder: "profile_pictures",
        transformation: [{ width: 200, height: 200, crop: "fill" }],
      });
      uploadedPicture = uploadRes.secure_url;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      firstName,
      middleName: String(middleName ?? "").trim(),
      lastName,
      email: normalizedEmail,
      password: hashed,
      role: "officer",
      profilePicture: uploadedPicture,
      phone: String(phone ?? "").trim(),
      workLocation: String(workLocation ?? "").trim(),
    });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.cookie("token", token, getAuthCookieOptions(req, 7 * 24 * 60 * 60 * 1000));

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        phone: user.phone,
        workLocation: user.workLocation,
        trackingStats: serializeTrackingStats(user.trackingStats),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");

  try {
    const user = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress || "unknown";
    await User.findByIdAndUpdate(user._id, {
      lastLoginAt: new Date(),
      lastLoginIP: clientIP
    });

    // Remember-me option: client may pass `remember: true` to prolong cookie
    const remember = Boolean(req.body?.remember);
    const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const tokenExpiresIn = remember ? "30d" : "1d";

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: tokenExpiresIn }
    );

    await logActivity({
      userId: String(user._id),
      action: "login",
      details: "Login ke sistem",
      metadata: { ip: clientIP },
    });

    res.cookie("token", token, getAuthCookieOptions(req, maxAge));

    res.status(200).json({
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        phone: user.phone,
        workLocation: user.workLocation,
        lastLoginAt: user.lastLoginAt,
        lastLoginIP: user.lastLoginIP,
        trackingStats: serializeTrackingStats(user.trackingStats),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    if (req.user?.id) {
      await logActivity({
        userId: req.user.id,
        action: "logout",
        details: "Logout dari sistem",
      });
    }

    const secure = shouldUseSecureCookies(req);
    res.clearCookie("token", { httpOnly: true, sameSite: secure ? "none" : "lax", secure, path: "/" });
    res.status(200).json({ message: "Logged out" });
  } catch (err) {
    res.status(500).json({ message: "Logout failed", error: err });
  }
};

/**
 * GET /auth/me
 * Return current authenticated user by verifying token
 */
export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // requireAuth middleware already attached req.user
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    let user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    if (!user.trackingStats?.updatedAt) {
      await recomputeWorkerTrackingStats(String(user._id));
      user = await User.findById(req.user.id);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
    }

    res.status(200).json({
      user: {
        id: user._id,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        profilePicture: user.profilePicture,
        phone: user.phone,
        workLocation: user.workLocation,
        lastLoginAt: user.lastLoginAt,
        lastLoginIP: user.lastLoginIP,
        createdAt: user.createdAt,
        trackingStats: serializeTrackingStats(user.trackingStats),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:3000";

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      res.status(400).json({ message: "Email wajib diisi." });
      return;
    }

    const user = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i") });
    if (!user) {
      // Don't reveal whether the email exists
      res.status(200).json({ message: "Jika email terdaftar, link reset password telah dikirim." });
      return;
    }

    // Generate a secure random token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    const resetUrl = `${CLIENT_URL}?resetToken=${resetToken}&email=${encodeURIComponent(user.email)}`;

    await sendEmail({
      to: user.email,
      subject: "Elder Care - Reset Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #333;">Reset Password</h2>
          <p>Halo <strong>${user.firstName}</strong>,</p>
          <p>Kami menerima permintaan untuk mereset password akun Anda. Klik tombol di bawah untuk membuat password baru:</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}"
               style="background-color: #0f172a; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Link ini berlaku selama <strong>1 jam</strong>. Jika Anda tidak meminta reset password, abaikan email ini.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">Elder Care - Sistem Monitoring Kesehatan Lansia</p>
        </div>
      `,
    });

    res.status(200).json({ message: "Jika email terdaftar, link reset password telah dikirim." });
  } catch (err) {
    console.error("forgotPassword error:", err);
    res.status(500).json({ message: "Gagal mengirim email reset password." });
  }
};

// ─── Reset Password ──────────────────────────────────────────────────────────
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, email, newPassword } = req.body;
    if (!token || !email || !newPassword) {
      res.status(400).json({ message: "Token, email, dan password baru wajib diisi." });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ message: "Password minimal 6 karakter." });
      return;
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const normalizedEmail = normalizeEmail(email);

    const user = await User.findOne({
      email: new RegExp(`^${escapeRegex(normalizedEmail)}$`, "i"),
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ message: "Token tidak valid atau sudah kadaluarsa." });
      return;
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({ message: "Password berhasil direset. Silakan login dengan password baru." });
  } catch (err) {
    console.error("resetPassword error:", err);
    res.status(500).json({ message: "Gagal mereset password." });
  }
};

// ─── Change Password (Authenticated) ────────────────────────────────────────
export const changePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (!oldPassword || !newPassword || !confirmPassword) {
      res.status(400).json({ message: "Password lama, password baru, dan konfirmasi wajib diisi." });
      return;
    }

    if (newPassword.length < 6) {
      res.status(400).json({ message: "Password baru minimal 6 karakter." });
      return;
    }

    if (newPassword !== confirmPassword) {
      res.status(400).json({ message: "Konfirmasi password tidak cocok." });
      return;
    }

    if (oldPassword === newPassword) {
      res.status(400).json({ message: "Password baru harus berbeda dari password lama." });
      return;
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({ message: "User tidak ditemukan." });
      return;
    }

    const validOldPassword = await bcrypt.compare(oldPassword, user.password);
    if (!validOldPassword) {
      res.status(400).json({ message: "Password lama salah." });
      return;
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    await logActivity({
      userId: String(user._id),
      action: "password_change",
      details: "Mengubah password akun",
    });

    res.status(200).json({ message: "Password berhasil diubah." });
  } catch (err) {
    console.error("changePassword error:", err);
    res.status(500).json({ message: "Gagal mengubah password." });
  }
};