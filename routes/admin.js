import express from "express";
import { isAuthenticated } from "../middlewares/auth.js";
import { allChats, getAllMessages, getAllUsers, getDashboardStats } from "../controller/admin.js";

const app = express.Router();

// app.use(isAuthenticated);

app.get("/", getAllUsers)
app.post("/verify")
app.get("/logout")
app.get("/users", getAllUsers)
app.get("/chats", allChats)
app.get("/messages", getAllMessages)

app.get("/stats", getDashboardStats)

export default app;