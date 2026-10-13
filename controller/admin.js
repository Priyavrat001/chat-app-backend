import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import { adminSecretKey } from "../app.js";
import { TryCatch } from "../middlewares/error.js";
import { AuditLog } from "../model/auditLog.js";
import { AiUsage } from "../model/aiUsage.js";
import { Chat } from "../model/chat.js";
import { Message } from "../model/message.js";
import { Report } from "../model/report.js";
import { User } from "../model/user.js";
import { cookieOptions } from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";

dotenv.config();

const ADMIN_ACTOR = "admin";
const MAX_PAGE_SIZE = 100;
const parsePagination = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 25, 1), MAX_PAGE_SIZE);
  return { page, limit, skip: (page - 1) * limit };
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const writeAuditLog = (action, targetType, targetId, reason, details = {}, actor = ADMIN_ACTOR) =>
  AuditLog.create({
    actor,
    action,
    targetType,
    targetId,
    reason,
    details,
  });

const toUtcDay = (date) => date.toISOString().slice(0, 10);

export const adminLogin = TryCatch(async (req, res, next) => {
  const { secretKey } = req.body;
  if (typeof secretKey !== "string" || secretKey !== adminSecretKey)
    return next(new ErrorHandler("Invalid Admin Key", 401));

  const token = jwt.sign({ secretKey }, process.env.JWT_SECRET, { expiresIn: "15m" });
  return res
    .status(200)
    .cookie("chat-app-admin-token", token, {
      ...cookieOptions,
      maxAge: 1000 * 60 * 15,
    })
    .json({
      success: true,
      message: "Authenticated Successfully, Welcome Admin",
    });
});

export const adminLogout = TryCatch(async (req, res) => {
  return res.status(200).cookie("chat-app-admin-token", "", {
    ...cookieOptions,
    maxAge: 0,
  }).json({
    success: true,
    message: "Admin logout successfully",
  });
});

export const getAdminData = TryCatch(async (req, res) =>
  res.status(200).json({ admin: true }),
);

export const getAllUsers = TryCatch(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const filter = search
    ? {
        $or: [
          { name: { $regex: escapeRegex(search), $options: "i" } },
          { username: { $regex: escapeRegex(search), $options: "i" } },
          { email: { $regex: escapeRegex(search), $options: "i" } },
          ...(mongoose.Types.ObjectId.isValid(search) ? [{ _id: search }] : []),
        ],
      }
    : {};

  const sortFields = ["name", "username", "email", "createdAt", "status", "role"];
  const sortField = sortFields.includes(req.query.sort) ? req.query.sort : "createdAt";
  const sortDirection = req.query.order === "asc" ? 1 : -1;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("name username email avatar role status lastSeenAt createdAt")
      .sort({ [sortField]: sortDirection, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  const userIds = users.map(({ _id }) => _id);
  const [chatCounts, messageCounts] = await Promise.all([
    Chat.aggregate([
      { $match: { members: { $in: userIds } } },
      { $unwind: "$members" },
      { $match: { members: { $in: userIds } } },
      { $group: { _id: "$members", chats: { $sum: 1 } } },
    ]),
    Message.aggregate([
      { $match: { sender: { $in: userIds } } },
      { $group: { _id: "$sender", messages: { $sum: 1 } } },
    ]),
  ]);
  const chatsByUser = new Map(chatCounts.map((row) => [row._id.toString(), row.chats]));
  const messagesByUser = new Map(messageCounts.map((row) => [row._id.toString(), row.messages]));

  return res.status(200).json({
    success: true,
    users: users.map((user) => ({
      ...user,
      avatar: user.avatar?.url || "",
      chatsCount: chatsByUser.get(user._id.toString()) || 0,
      messagesCount: messagesByUser.get(user._id.toString()) || 0,
      isOnline: Boolean(user.lastSeenAt && user.lastSeenAt >= new Date(Date.now() - 15 * 60 * 1000)),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const updateUserStatus = TryCatch(async (req, res, next) => {
  const { status, reason } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) return next(new ErrorHandler("User not found.", 404));
  if (!["active", "suspended", "deactivated"].includes(status))
    return next(new ErrorHandler("Invalid account status.", 400));
  if (user.status === status)
    return res.status(200).json({ success: true, user: { _id: user._id, status } });

  const previousStatus = user.status;
  user.status = status;
  await user.save();
  await writeAuditLog(
    `user.${status}`,
    "user",
    user._id,
    reason,
    { previousStatus, status },
  );

  const io = req.app.get("io");
  if (status !== "active") {
    const sockets = await io.in(user._id.toString()).fetchSockets();
    sockets.forEach((socket) => socket.disconnect(true));
  }

  return res.status(200).json({
    success: true,
    user: { _id: user._id, status: user.status },
  });
});

export const updateUserRole = TryCatch(async (req, res, next) => {
  const { role, reason } = req.body;
  if (!["user", "moderator"].includes(role))
    return next(new ErrorHandler("Only user or moderator roles can be assigned.", 400));
  const user = await User.findById(req.params.id);
  if (!user) return next(new ErrorHandler("User not found.", 404));
  const previousRole = user.role;
  user.role = role;
  await user.save();
  await writeAuditLog("user.role_changed", "user", user._id, reason, {
    previousRole,
    role,
  });
  return res.status(200).json({
    success: true,
    user: { _id: user._id, role: user.role },
  });
});

export const allChats = TryCatch(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
  const filter = { $or: [{ groupChat: true }, { groupchat: true }] };
  if (req.query.status && ["active", "restricted", "archived"].includes(req.query.status))
    filter.status = req.query.status;
  if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

  const [chats, total] = await Promise.all([
    Chat.find(filter)
      .populate("members", "name username avatar")
      .populate("creator", "name username avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Chat.countDocuments(filter),
  ]);
  const chatIds = chats.map(({ _id }) => _id);
  const messageCounts = await Message.aggregate([
    { $match: { chat: { $in: chatIds } } },
    { $group: { _id: "$chat", totalMessages: { $sum: 1 } } },
  ]);
  const countByChat = new Map(messageCounts.map((row) => [row._id.toString(), row.totalMessages]));

  return res.status(200).json({
    success: true,
    groups: chats.map((chat) => ({
      ...chat,
      groupChat: true,
      creator: chat.creator
        ? { _id: chat.creator._id, name: chat.creator.name, username: chat.creator.username }
        : null,
      members: chat.members.map((member) => ({
        _id: member._id,
        name: member.name,
        username: member.username,
        avatar: member.avatar?.url || "",
      })),
      memberCount: chat.members.length,
      messageCount: countByChat.get(chat._id.toString()) || 0,
    })),
    allChats: chats.map((chat) => ({
      ...chat,
      avatar: chat.members.slice(0, 3).map((member) => member.avatar?.url || ""),
      totalMembers: chat.members.length,
      totalMessages: countByChat.get(chat._id.toString()) || 0,
      creator: {
        name: chat.creator?.name || "None",
        avatar: chat.creator?.avatar?.url || "",
      },
      members: chat.members.map((member) => ({
        _id: member._id,
        name: member.name,
        avatar: member.avatar?.url || "",
      })),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const updateGroupStatus = TryCatch(async (req, res, next) => {
  const { status, reason } = req.body;
  if (!["active", "restricted", "archived"].includes(status))
    return next(new ErrorHandler("Invalid group status.", 400));
  const group = await Chat.findOne({
    _id: req.params.id,
    $or: [{ groupChat: true }, { groupchat: true }],
  });
  if (!group) return next(new ErrorHandler("Group not found.", 404));
  const previousStatus = group.status || "active";
  group.status = status;
  await group.save();
  await writeAuditLog("group.status_changed", "group", group._id, reason, {
    previousStatus,
    status,
  }, req.adminActor || ADMIN_ACTOR);
  return res.status(200).json({
    success: true,
    group: { _id: group._id, status: group.status },
  });
});

export const getReports = TryCatch(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};
  if (req.query.status && ["pending", "reviewing", "resolved", "dismissed"].includes(req.query.status))
    filter.status = req.query.status;
  const [reports, total] = await Promise.all([
    Report.find(filter)
      .populate("reporter", "name username")
      .populate("targetUser", "name username status")
      .populate("targetChat", "name status")
      .populate({
        path: "targetMessage",
        select: "content createdAt sender chat",
        populate: { path: "sender", select: "name username" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Report.countDocuments(filter),
  ]);
  return res.status(200).json({
    success: true,
    reports,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const updateReport = TryCatch(async (req, res, next) => {
  const { status, reason } = req.body;
  if (!["reviewing", "resolved", "dismissed"].includes(status))
    return next(new ErrorHandler("Invalid report status.", 400));
  const report = await Report.findById(req.params.id);
  if (!report) return next(new ErrorHandler("Report not found.", 404));
  const previousStatus = report.status;
  report.status = status;
  report.decisionReason = reason.trim();
  report.reviewedBy = ADMIN_ACTOR;
  report.reviewedAt = new Date();
  await report.save();
  await writeAuditLog("report.reviewed", "report", report._id, reason, {
    previousStatus,
    status,
  }, req.adminActor || ADMIN_ACTOR);
  return res.status(200).json({ success: true, report });
});

export const getAuditLogs = TryCatch(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const [logs, total] = await Promise.all([
    AuditLog.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(),
  ]);
  return res.status(200).json({
    success: true,
    logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

export const getSystemHealth = TryCatch(async (req, res) => {
  const io = req.app.get("io");
  const apiMetrics = req.app.locals.apiMetrics || {
    requests: 0,
    failures: 0,
    totalResponseTimeMs: 0,
  };
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [sockets, ai] = await Promise.all([
    io.fetchSockets(),
    AiUsage.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: null,
          requests: { $sum: 1 },
          failures: { $sum: { $cond: [{ $eq: ["$outcome", "failure"] }, 1, 0] } },
          averageLatencyMs: { $avg: "$latencyMs" },
          quotaErrors: {
            $sum: { $cond: [{ $eq: ["$providerStatus", 429] }, 1, 0] },
          },
        },
      },
    ]),
  ]);
  const aiMetrics = ai[0] || {
    requests: 0,
    failures: 0,
    averageLatencyMs: 0,
    quotaErrors: 0,
  };
  const configuredCloudinary = Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET,
  );
  let cloudinaryStatus = configuredCloudinary ? "unreachable" : "not_configured";
  if (configuredCloudinary) {
    try {
      await cloudinary.api.ping();
      cloudinaryStatus = "connected";
    } catch (error) {
      console.error("Cloudinary health check failed:", error);
    }
  }

  return res.status(200).json({
    success: true,
    health: {
      database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      cloudinary: cloudinaryStatus,
      socketConnections: sockets.length,
      uptimeSeconds: Math.floor(process.uptime()),
      api: {
        requests: apiMetrics.requests,
        failures: apiMetrics.failures,
        failureRate: apiMetrics.requests
          ? Number((apiMetrics.failures / apiMetrics.requests).toFixed(4))
          : 0,
        averageResponseTimeMs: apiMetrics.requests
          ? Math.round(apiMetrics.totalResponseTimeMs / apiMetrics.requests)
          : 0,
        window: "since_restart",
      },
      ai: {
        ...aiMetrics,
        averageLatencyMs: Math.round(aiMetrics.averageLatencyMs || 0),
        estimatedCost: null,
        window: "7d",
      },
    },
  });
});

export const getDashboardStats = TryCatch(async (req, res) => {
  const range = ["day", "week", "month"].includes(req.query.range) ? req.query.range : "week";
  const rangeDays = { day: 1, week: 7, month: 30 }[range];
  const days = range === "day" ? 24 : rangeDays;
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (range === "day") start.setUTCHours(now.getUTCHours() - 23, 0, 0, 0);
  else start.setUTCDate(start.getUTCDate() - rangeDays + 1);
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = new Date(dayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const activeSince = new Date(Date.now() - 15 * 60 * 1000);
  const bucketFormat = range === "day" ? "%Y-%m-%dT%H:00" : "%Y-%m-%d";
  const bucketCount = range === "day" ? 24 : days;

  const [
    groupsCount,
    usersCount,
    messagesCount,
    totalChatsCount,
    activeUsersCount,
    newUsersToday,
    newUsersThisWeek,
    userGrowth,
    messageActivity,
  ] = await Promise.all([
    Chat.countDocuments({ $or: [{ groupChat: true }, { groupchat: true }] }),
    User.countDocuments(),
    Message.countDocuments(),
    Chat.countDocuments(),
    User.countDocuments({ status: "active", lastSeenAt: { $gte: activeSince } }),
    User.countDocuments({ createdAt: { $gte: dayStart, $lte: now } }),
    User.countDocuments({ createdAt: { $gte: weekStart, $lte: now } }),
    User.aggregate([
      { $match: { createdAt: { $gte: start, $lte: now } } },
      { $group: { _id: { $dateToString: { format: bucketFormat, date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } },
    ]),
    Message.aggregate([
      { $match: { createdAt: { $gte: start, $lte: now } } },
      { $group: { _id: { $dateToString: { format: bucketFormat, date: "$createdAt", timezone: "UTC" } }, count: { $sum: 1 } } },
    ]),
  ]);

  const labels = [];
  const cursor = new Date(start);
  for (let index = 0; index < bucketCount; index += 1) {
    labels.push(range === "day"
      ? `${cursor.getUTCHours().toString().padStart(2, "0")}:00`
      : cursor.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }));
    if (range === "day") cursor.setUTCHours(cursor.getUTCHours() + 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const fillSeries = (rows) => {
    const counts = new Map(rows.map(({ _id, count }) => [String(_id), count]));
    const bucketCursor = new Date(start);
    return Array.from({ length: bucketCount }, () => {
      const key = range === "day"
        ? `${toUtcDay(bucketCursor)}T${bucketCursor.getUTCHours().toString().padStart(2, "0")}:00`
        : toUtcDay(bucketCursor);
      const count = counts.get(key) || 0;
      if (range === "day") bucketCursor.setUTCHours(bucketCursor.getUTCHours() + 1);
      else bucketCursor.setUTCDate(bucketCursor.getUTCDate() + 1);
      return count;
    });
  };

  return res.status(200).json({
    success: true,
    stats: {
      groupsCount,
      usersCount,
      messagesCount,
      totalChatsCount,
      activeUsersCount,
      newUsersToday,
      newUsersThisWeek,
      range,
      chartLabels: labels,
      userGrowthChart: fillSeries(userGrowth),
      messagesChart: fillSeries(messageActivity),
    },
  });
});
