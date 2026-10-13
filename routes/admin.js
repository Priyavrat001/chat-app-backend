import express from "express";
import { body, param } from "express-validator";
import {
    adminLogin,
    adminLogout,
    allChats,
    getAdminData,
    getAuditLogs,
    getAllUsers,
    getDashboardStats,
    getReports,
    getSystemHealth,
    updateGroupStatus,
    updateReport,
    updateUserRole,
    updateUserStatus,
} from "../controller/admin.js";
import { adminOnly, adminOrModerator } from "../middlewares/auth.js";
import { adminLoginValidator, validateHandler } from "../utils/validator.js";

const app = express.Router();

// app.use(isAuthenticated);

app.post("/verify", adminLoginValidator(), validateHandler, adminLogin)
app.get("/logout", adminLogout)

app.get("/", adminOnly, getAdminData)

app.get("/users", adminOnly, getAllUsers)
app.patch(
  "/users/:id/status",
  adminOnly,
  param("id").isMongoId(),
  body("status").isIn(["active", "suspended", "deactivated"]),
  body("reason").isString().trim().notEmpty().isLength({ max: 1000 }),
  validateHandler,
  updateUserStatus,
)
app.patch(
  "/users/:id/role",
  adminOnly,
  param("id").isMongoId(),
  body("role").isIn(["user", "moderator"]),
  body("reason").isString().trim().notEmpty().isLength({ max: 1000 }),
  validateHandler,
  updateUserRole,
)
app.get("/groups", adminOrModerator, allChats)
app.get("/chats", adminOnly, allChats)
app.patch(
  "/groups/:id/status",
  adminOrModerator,
  param("id").isMongoId(),
  body("status").isIn(["active", "restricted", "archived"]),
  body("reason").isString().trim().notEmpty().isLength({ max: 1000 }),
  validateHandler,
  updateGroupStatus,
)
app.get("/reports", adminOrModerator, getReports)
app.patch(
  "/reports/:id",
  adminOrModerator,
  param("id").isMongoId(),
  body("status").isIn(["reviewing", "resolved", "dismissed"]),
  body("reason").isString().trim().notEmpty().isLength({ max: 1000 }),
  validateHandler,
  updateReport,
)
app.get("/audit-logs", adminOnly, getAuditLogs)
app.get("/health", adminOnly, getSystemHealth)
app.get("/stats", adminOnly, getDashboardStats)

export default app;