import express from "express";
import { addMembers, deleteChat, getChatDetails, getMessages, getMyChats, getMyGroup, leaveGroup, newGroupChat, removeMembers, renameGroup, sendAttachment } from "../controller/chat.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { attachmentMulter } from "../middlewares/multer.js";
import { chatIdValidator, newGroupChatValidator, removeValidator, renameValidator, sendAttachmentValidator, validateHandler } from "../utils/validator.js";

const app = express.Router();

app.use(isAuthenticated);

app.post("/new", newGroupChatValidator(), validateHandler, newGroupChat);
app.get("/my", getMyChats);
app.get("/my/groups", getMyGroup);
app.put("/addmembers", addMembers);
app.put("/removemember", removeValidator(), validateHandler,  removeMembers);
app.delete("/leave/:id", chatIdValidator(), validateHandler,  leaveGroup);


//Send Attachment
app.post("/message", attachmentMulter, sendAttachmentValidator(), validateHandler, sendAttachment);

//get message
app.get("/message/:id", chatIdValidator(), validateHandler, getMessages);

//get chat detials, rename and delete
app.route("/:id").get( chatIdValidator(), validateHandler, getChatDetails).put(renameValidator(), validateHandler, renameGroup).delete(chatIdValidator(), validateHandler, deleteChat);


export default app;