import express from "express";
import { addMembers, deleteChat, getChatDetails, getMessages, getMyChats, getMyGroup, leaveGroup, newGroupChat, removeMembers, renameGroup, sendAttachment } from "../controller/chat.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { attachmentMulter } from "../middlewares/multer.js";
import { newGroupChatValidator, validateHandler } from "../utils/validator.js";

const app = express.Router();

app.use(isAuthenticated);

app.post("/new", newGroupChatValidator(), validateHandler, newGroupChat);
app.get("/my", getMyChats);
app.get("/my/groups", getMyGroup);
app.put("/addmembers", addMembers);
app.put("/removemember", removeMembers);
app.delete("/leave/:id", leaveGroup);


//Send Attachment
app.post("/message", attachmentMulter, sendAttachment);

//get message
app.get("/message/:id", getMessages);

//get chat detials, rename and delete
app.route("/:id").get(getChatDetails).put(renameGroup).delete(deleteChat);


export default app;