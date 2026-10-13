import express from "express";
import { acceptFriendRequest, createReport, getMyFriends, getMyProfile, getNotifaction, login, logout, newUsers, searchUser, sendFriendRequest } from "../controller/user.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { singleAvatar } from "../middlewares/multer.js";
import { acceptRequestValidator, loginValidator, registerValidator, sendRequestValidator, validateHandler } from "../utils/validator.js";
import { body } from "express-validator";

const app = express.Router();


app.post("/new", singleAvatar, registerValidator(), validateHandler, newUsers);
app.post("/login", loginValidator(), validateHandler, login);

app.use(isAuthenticated);

app.get("/myprofile", getMyProfile);
app.get("/logout", logout);
app.get("/search", searchUser);
app.put("/sendrequest", sendRequestValidator(), validateHandler, sendFriendRequest);
app.put("/acceptrequest", acceptRequestValidator(), validateHandler, acceptFriendRequest);

app.get("/notification", getNotifaction)
app.get("/friends", getMyFriends)
app.post(
  "/report",
  body("reason").isString().trim().notEmpty().isLength({ max: 1000 }),
  body("targetUser").optional().isMongoId(),
  body("targetChat").optional().isMongoId(),
  body("targetMessage").optional().isMongoId(),
  validateHandler,
  createReport,
);


export default app;