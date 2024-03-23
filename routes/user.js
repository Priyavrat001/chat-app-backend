import express from "express";
import { acceptFriendRequest, getMyFriends, getMyProfile, getNotifaction, login, logout, newUsers, searchUser, sendFriendRequest } from "../controller/user.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { singleAvatar } from "../middlewares/multer.js";
import { acceptRequestValidator, loginValidator, registerValidator, sendRequestValidator, validateHandler } from "../utils/validator.js";

const app = express.Router();


app.post("/new", singleAvatar, registerValidator(), validateHandler, newUsers);
app.post("/login", loginValidator(), validateHandler, login);

app.use(isAuthenticated);

app.get("/myprofile", getMyProfile);
app.get("/logout", logout);
app.get("/search", searchUser);
app.put("/send-request", sendRequestValidator(), validateHandler, sendFriendRequest);
app.put("/accept-request", acceptRequestValidator(), validateHandler, acceptFriendRequest);

app.get("/notification", getNotifaction)
app.get("/friends", getMyFriends)


export default app;