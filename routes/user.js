import express from "express";
import { deleteUser, getMyProfile, login, logout, newUsers, searchUser } from "../controller/user.js";
import { singleAvatar } from "../middlewares/multer.js";
import { isAuthenticated } from "../middlewares/auth.js";

const app = express.Router();

app.post("/new", singleAvatar, newUsers);
app.post("/login", login);
app.get("/myprofile",isAuthenticated, getMyProfile);
app.get("/logout",isAuthenticated, logout);
app.get("/logout",isAuthenticated, searchUser);
app.delete("/deleteuser", deleteUser);


export default app;