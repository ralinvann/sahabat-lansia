import mongoose, { Document, Schema, Types } from "mongoose";

export type ActivityAction =
  | "login"
  | "logout"
  | "password_change"
  | "profile_update"
  | "file_upload"
  | "file_update"
  | "file_delete";

export interface IActivityLog extends Document {
  user: Types.ObjectId;
  action: ActivityAction;
  details: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    action: {
      type: String,
      enum: ["login", "logout", "password_change", "profile_update", "file_upload", "file_update", "file_delete"],
      required: true,
      index: true,
    },
    details: { type: String, required: true, trim: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

ActivityLogSchema.index({ user: 1, createdAt: -1 });

export const ActivityLog =
  mongoose.models.ActivityLog || mongoose.model<IActivityLog>("ActivityLog", ActivityLogSchema);
