import mongoose from "mongoose";

const schema = new mongoose.Schema({
  operation: {
    type: String,
    enum: ["reply-suggestions", "summarize", "ask-history"],
    required: true,
  },
  outcome: {
    type: String,
    enum: ["success", "failure"],
    required: true,
  },
  latencyMs: {
    type: Number,
    required: true,
    min: 0,
  },
  providerStatus: Number,
}, { timestamps: true });

schema.index({ createdAt: -1 });

export const AiUsage = mongoose.models.AiUsage || mongoose.model("AiUsage", schema);
