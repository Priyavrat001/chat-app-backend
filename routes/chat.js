import express from "express";
import { addMembers, getChatDetails, getMyChats, getMyGroup, leaveGroup, newGroupChat, removeMembers, sendAttachment } from "../controller/chat.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { attachmentMulter } from "../middlewares/multer.js";

const app = express.Router();

app.use(isAuthenticated);

app.post("/new", newGroupChat);
app.get("/my", getMyChats);
app.get("/my/groups", getMyGroup);
app.put("/addmembers", addMembers);
app.put("/removemember", removeMembers);
app.delete("/leave/:id", leaveGroup);


//Send Attachment
app.post("/message", attachmentMulter, sendAttachment);

//get message
app.route("/:id").get(getChatDetails).put().delete()


//get chat detials, rename and delete


export default app;