import express from "express";
import { adminLogin, adminLogout, allChats, getAdminData, getAllMessages, getAllUsers, getDashboardStats } from "../controller/admin.js";
import { adminOnly } from "../middlewares/auth.js";
import { adminLoginValidator, validateHandler } from "../utils/validator.js";

const app = express.Router();

// app.use(isAuthenticated);

app.post("/verify", adminLoginValidator(), validateHandler, adminLogin)
app.get("/logout", adminLogout)

// only admin can access this route

app.use(adminOnly)

app.get("/", getAdminData)

app.get("/users", getAllUsers)
app.get("/chats", allChats)
app.get("/messages", getAllMessages)

app.get("/stats", getDashboardStats)

export default app;