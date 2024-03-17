import express from "express";
import { addMembers, getMyChats, getMyGroup, newGroupChat, removeMembers } from "../controller/chat.js";
import { isAuthenticated } from "../middlewares/auth.js";

const app = express.Router();

app.use(isAuthenticated);

app.post("/new", newGroupChat);
app.get("/my", getMyChats);
app.get("/my/groups", getMyGroup);
app.put("/addmembers", addMembers);
app.delete("/removemember", removeMembers);

// TODO

// send attachment

//get message

//get chat detials, rename and delete


export default app;