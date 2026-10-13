import mongoose, { Types } from "mongoose";

const schema = new mongoose.Schema({
  actor: {
    type: String,
    required: true,
  },
  action: {
    type: String,
    required: true,
  },
  targetType: {
    type: String,
    required: true,
  },
  targetId: {
    type: Types.ObjectId,
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 1000,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
}, { timestamps: true });

schema.index({ createdAt: -1 });

export const AuditLog = mongoose.models.AuditLog || mongoose.model("AuditLog", schema);
