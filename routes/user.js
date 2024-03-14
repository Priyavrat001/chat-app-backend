import express from "express";
import { deleteUser, getMyProfile, login, newUsers } from "../controller/user.js";
import { singleAvatar } from "../middlewares/multer.js";
import { isAuthenticated } from "../middlewares/auth.js";

const app = express.Router();

app.post("/new", singleAvatar, newUsers);
app.post("/login", login);
app.get("/myprofile",isAuthenticated, getMyProfile)
app.delete("/deleteuser", deleteUser);


export default app;