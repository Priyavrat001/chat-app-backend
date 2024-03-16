import express from "express";
import { getMyChats, newGroupChat } from "../controller/chat.js";
import { isAuthenticated } from "../middlewares/auth.js";

const app = express.Router();

app.use(isAuthenticated);

app.post("/new", newGroupChat);
app.get("/my", getMyChats);



export default app;