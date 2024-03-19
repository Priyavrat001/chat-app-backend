import express from "express";
import { deleteUser, getMyProfile, login, logout, newUsers, searchUser } from "../controller/user.js";
import { singleAvatar } from "../middlewares/multer.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { loginValidator, registerValidator, validateHandler } from "../utils/validator.js";

const app = express.Router();

app.post("/new", singleAvatar, registerValidator(), validateHandler, newUsers);
app.post("/login", loginValidator(), validateHandler, login);
app.get("/myprofile",isAuthenticated, getMyProfile);
app.get("/logout",isAuthenticated, logout);
app.get("/search",isAuthenticated, searchUser);
app.delete("/deleteuser", deleteUser);


export default app;