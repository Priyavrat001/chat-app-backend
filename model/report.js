import mongoose, { Types } from "mongoose";

const schema = new mongoose.Schema({
  reporter: {
    type: Types.ObjectId,
    ref: "User",
    required: true,
  },
  targetUser: {
    type: Types.ObjectId,
    ref: "User",
  },
  targetChat: {
    type: Types.ObjectId,
    ref: "Chat",
  },
  targetMessage: {
    type: Types.ObjectId,
    ref: "Message",
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000,
  },
  status: {
    type: String,
    enum: ["pending", "reviewing", "resolved", "dismissed"],
    default: "pending",
  },
  decisionReason: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  reviewedBy: {
    type: String,
  },
  reviewedAt: Date,
}, { timestamps: true });

schema.index({ status: 1, createdAt: -1 });

export const Report = mongoose.models.Report || mongoose.model("Report", schema);
