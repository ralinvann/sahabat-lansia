import { Request, Response } from "express";
import User from "../models/User";
import { hashPassword, comparePassword } from "../utils/hash";
import { signUser } from "../utils/jwt";
import { uploadBufferToCloudinary } from "../utils/cloudinaryUpload";
import { logActivity } from "../utils/activityLogger";

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

function toUserResponse(user: any) {
  return {
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
  };
}

/**
 * @route POST /api/users/register
 * @desc Register a new user (public/officer only)
 * NOTE: Do NOT allow role escalation here. Admin/Superadmin creation must go through admin endpoint.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const firstName = String(req.body.firstName ?? "").trim();
    const middleName = String(req.body.middleName ?? "").trim();
    const lastName = String(req.body.lastName ?? "").trim();
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    const role = "officer";
    const phone = String(req.body.phone ?? "").trim();
    const workLocation = String(req.body.workLocation ?? "").trim();

    if (!firstName || !email || !password) {
      res.status(400).json({ message: "Missing required fields" });
      return;
    }

    if (!email.includes("@")) {
      res.status(400).json({ message: "Invalid email" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "Password must be at least 8 characters" });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: "Email already registered" });
      return;
    }

    const hashed = await hashPassword(password);

    const user = await User.create({
      firstName,
      middleName,
      lastName,
      email,
      password: hashed,
      role,
      phone,
      workLocation,
    });

    const token = signUser(user);

    res.status(201).json({
      token,
      user: toUserResponse(user),
    });
    return;
  } catch (err) {
    console.error("register error:", err);
    res.status(500).json({ message: "Registration failed" });
    return;
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");

    if (!email || !password) {
      res.status(400).json({ message: "Missing credentials" });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const valid = await comparePassword(password, user.password);
    if (!valid) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = signUser(user);

    await logActivity({
      userId: String(user._id),
      action: "login",
      details: "Login ke sistem",
      metadata: { ip: req.ip || req.socket.remoteAddress || "unknown" },
    });

    res.status(200).json({
      token,
      user: toUserResponse(user),
    });
    return;
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ message: "Login failed" });
    return;
  }
};

export const me = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(toUserResponse(user));
    return;
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ message: "Error fetching user" });
    return;
  }
};

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const firstName = req.body.firstName !== undefined ? String(req.body.firstName).trim() : undefined;
    const middleName = req.body.middleName !== undefined ? String(req.body.middleName).trim() : undefined;
    const lastName = req.body.lastName !== undefined ? String(req.body.lastName).trim() : undefined;
    const phone = req.body.phone !== undefined ? String(req.body.phone).trim() : undefined;
    const workLocation = req.body.workLocation !== undefined ? String(req.body.workLocation).trim() : undefined;

    const $set: Record<string, any> = {};
    if (firstName !== undefined) $set.firstName = firstName;
    if (middleName !== undefined) $set.middleName = middleName;
    if (lastName !== undefined) $set.lastName = lastName;
    if (phone !== undefined) $set.phone = phone;
    if (workLocation !== undefined) $set.workLocation = workLocation;

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const changedFields = Object.keys($set);
    if (changedFields.length > 0) {
      await logActivity({
        userId,
        action: "profile_update",
        details: "Memperbarui profil",
        metadata: { fields: changedFields },
      });
    }

    res.status(200).json(toUserResponse(updated));
    return;
  } catch (err) {
    console.error("updateProfile error:", err);
    res.status(500).json({ message: "Profile update failed" });
    return;
  }
};

export const updatePassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const currentPassword = String(req.body.currentPassword ?? "");
    const newPassword = String(req.body.newPassword ?? "");

    if (!currentPassword || !newPassword) {
      res.status(400).json({ message: "Missing password fields" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ message: "New password must be at least 8 characters" });
      return;
    }

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    const valid = await comparePassword(currentPassword, user.password);
    if (!valid) {
      res.status(400).json({ message: "Current password is incorrect" });
      return;
    }

    user.password = await hashPassword(newPassword);
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
    return;
  } catch (err) {
    console.error("updatePassword error:", err);
    res.status(500).json({ message: "Password update failed" });
    return;
  }
};

export const uploadAvatar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!req.file?.buffer) {
      res.status(400).json({ message: "No file uploaded" });
      return;
    }

    const { url } = await uploadBufferToCloudinary(req.file.buffer, "users/avatars");

    const updated = await User.findByIdAndUpdate(
      userId,
      { $set: { profilePicture: url } },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    await logActivity({
      userId,
      action: "file_upload",
      details: "Mengunggah foto profil",
      metadata: { type: "avatar" },
    });

    res.status(200).json(toUserResponse(updated));
    return;
  } catch (err) {
    console.error("uploadAvatar error:", err);
    res.status(500).json({ message: "Avatar upload failed" });
    return;
  }
};

export const listUsers = async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find()
      .select("-password")
      .sort({ createdAt: -1 });
    res.status(200).json(users);
    return;
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ message: "Error fetching users" });
    return;
  }
};

/**
 * @route POST /api/users
 * @desc Create user (admin/superadmin). Only superadmin can create admin/superadmin roles.
 */
export const createUserByAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const actorRole = String(req.user?.role ?? "").toLowerCase();

    const firstName = String(req.body.firstName ?? "").trim();
    const middleName = String(req.body.middleName ?? "").trim();
    const lastName = String(req.body.lastName ?? "").trim();
    const email = String(req.body.email ?? "").trim().toLowerCase();
    const password = String(req.body.password ?? "");
    const requestedRole = String(req.body.role ?? "officer").trim().toLowerCase();
    const role = requestedRole || "officer";
    const profilePicture = String(req.body.profilePicture ?? "").trim();
    const phone = String(req.body.phone ?? "").trim();
    const workLocation = String(req.body.workLocation ?? "").trim();

    if (!firstName || !email || !password) {
      res.status(400).json({ message: "Missing required fields" });
      return;
    }

    if (!email.includes("@")) {
      res.status(400).json({ message: "Invalid email" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "Password must be at least 8 characters" });
      return;
    }

    const allowedRoles = new Set(["officer", "admin", "superadmin"]);
    if (!allowedRoles.has(role)) {
      res.status(400).json({ message: "Invalid role" });
      return;
    }

    if (actorRole !== "superadmin" && (role === "admin" || role === "superadmin")) {
      res.status(403).json({ message: "Only superadmin can assign admin/superadmin role" });
      return;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: "Email already registered" });
      return;
    }

    const hashed = await hashPassword(password);
    const user = await User.create({
      firstName,
      middleName,
      lastName,
      email,
      password: hashed,
      role,
      profilePicture,
      phone,
      workLocation,
    });

    res.status(201).json({
      message: "User created successfully",
      user: toUserResponse(user),
    });
    return;
  } catch (err) {
    console.error("createUserByAdmin error:", err);
    res.status(500).json({ message: "User creation failed" });
    return;
  }
};

/**
 * @route GET /api/users/:id
 * @desc Get user by ID (admin/superadmin)
 */
export const getUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(user);
    return;
  } catch (err) {
    console.error("getUser error:", err);
    res.status(500).json({ message: "Error fetching user" });
    return;
  }
};

/**
 * @route PUT /api/users/:id
 * @desc Update user (admin/superadmin)
 */
export const updateUserByAdmin = async (req: Request, res: Response): Promise<void> => {
  try {
    const actorRole = String(req.user?.role ?? "").toLowerCase();

    const firstName = req.body.firstName !== undefined ? String(req.body.firstName).trim() : undefined;
    const middleName = req.body.middleName !== undefined ? String(req.body.middleName).trim() : undefined;
    const lastName = req.body.lastName !== undefined ? String(req.body.lastName).trim() : undefined;
    const email = req.body.email !== undefined ? String(req.body.email).trim().toLowerCase() : undefined;
    const phone = req.body.phone !== undefined ? String(req.body.phone).trim() : undefined;
    const workLocation = req.body.workLocation !== undefined ? String(req.body.workLocation).trim() : undefined;
    const role = req.body.role !== undefined ? String(req.body.role).trim().toLowerCase() : undefined;

    const $set: Record<string, any> = {};
    if (firstName !== undefined) $set.firstName = firstName;
    if (middleName !== undefined) $set.middleName = middleName;
    if (lastName !== undefined) $set.lastName = lastName;
    if (email !== undefined) $set.email = email;
    if (phone !== undefined) $set.phone = phone;
    if (workLocation !== undefined) $set.workLocation = workLocation;

    if (role !== undefined) {
      if (actorRole !== "superadmin") {
        res.status(403).json({ message: "Only superadmin can update role" });
        return;
      }
      if (!["officer", "admin", "superadmin"].includes(role)) {
        res.status(400).json({ message: "Invalid role" });
        return;
      }
      $set.role = role;
    }

    if (email !== undefined) {
      if (!email.includes("@")) {
        res.status(400).json({ message: "Invalid email" });
        return;
      }
      const existing = await User.findOne({ email, _id: { $ne: req.params.id } });
      if (existing) {
        res.status(409).json({ message: "Email already registered" });
        return;
      }
    }

    const updated = await User.findByIdAndUpdate(
      req.params.id,
      { $set },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updated) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(updated);
    return;
  } catch (err) {
    console.error("updateUserByAdmin error:", err);
    res.status(500).json({ message: "User update failed" });
    return;
  }
};

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json({ message: "User deleted successfully" });
    return;
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ message: "User deletion failed" });
    return;
  }
};
