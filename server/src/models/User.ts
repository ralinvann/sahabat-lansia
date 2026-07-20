import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  firstName: string;
  middleName?: string;
  lastName?: string;
  email: string;
  password: string;
  role: "superadmin" | "admin" | "officer";
  profilePicture?: string;
  phone?: string;
  workLocation?: string;
  lastLoginAt?: Date;
  lastLoginIP?: string;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  refreshTokens?: Array<{
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }>;
  trackingStats?: {
    yearly: Array<{
      year: string;
      totalUniqueElderly: number;
      monthlyCounts: Array<{
        month: number;
        count: number;
      }>;
      updatedAt: Date;
    }>;
    updatedAt?: Date;
  };
  createdAt: Date;
}

const TrackingMonthStatSchema = new Schema(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    count: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const TrackingYearStatSchema = new Schema(
  {
    year: { type: String, required: true, trim: true },
    totalUniqueElderly: { type: Number, required: true, min: 0, default: 0 },
    monthlyCounts: { type: [TrackingMonthStatSchema], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new Schema<IUser>({
  firstName: { type: String, required: true },
  middleName: { type: String, default: "" }, // optional
  lastName: { type: String, default: "" },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["superadmin", "admin", "officer"],
    default: "officer",
  },
  profilePicture: { type: String, default: "" },
  phone: { type: String, default: "" },
  workLocation: { type: String, default: "" },
  lastLoginAt: { type: Date },
  lastLoginIP: { type: String },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  refreshTokens: [
    {
      tokenHash: { type: String },
      createdAt: { type: Date },
      expiresAt: { type: Date },
      userAgent: { type: String },
      ip: { type: String },
    },
  ],
  trackingStats: {
    yearly: { type: [TrackingYearStatSchema], default: [] },
    updatedAt: { type: Date },
  },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model<IUser>("User", userSchema);
