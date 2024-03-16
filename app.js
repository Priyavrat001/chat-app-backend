import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import { errorMiddleware } from "./middlewares/error.js";
import { connectDB } from "./utils/features.js";

import chatRoute from "./routes/chat.js";
import userRoute from "./routes/user.js";


dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

connectDB();

app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);

app.use(errorMiddleware);

app.listen(port,()=>{
    console.log(`port is running on ${port}`)
})