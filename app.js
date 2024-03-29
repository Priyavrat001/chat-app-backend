import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import { errorMiddleware } from "./middlewares/error.js";
import { connectDB } from "./utils/features.js";
import { Server } from "socket.io";
import { createServer } from "http";
import { NEW_MESSAGE, NEW_MESSAGE_ALERT } from "./constants/event.js"
import { v4 as uuid } from "uuid";
import cors from "cors";
import {v2 as cloudinary} from "cloudinary";
import { getSockets } from "./lib/helper.js";
import { Message } from "./model/message.js";
import { corsOptions } from "./constants/config.js";
import { socketAuthenticator } from "./middlewares/auth.js";

import chatRoute from "./routes/chat.js";
import userRoute from "./routes/user.js";
import adminRoute from "./routes/admin.js";


dotenv.config();
export const envMode = process.env.NODE_ENV === "DEVELOPEMENT" || "PRODUCTION";
export const adminSecretKey = process.env.ADMIN_SECRET_KEY || "sdfsfsfsfdsdsfsdf";
const port = process.env.PORT || 4000;
export const userSocketIDs = new Map();

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: corsOptions,
  });

connectDB();

cloudinary.config({
    cloud_name:process.env.CLOUDINARY_CLOUD_NAME,
    api_key:process.env.CLOUDINARY_API_KEY,
    api_secret:process.env.CLOUDINARY_API_SECRET
})

app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);

io.use((socket, next)=>{
    cookieParser()(socket.request, socket.request.resume, async(err)=>{
        return await socketAuthenticator(err, socket, next);
    })
})

io.on("connection", (socket) => {

    const user = {
        _id: "dfd",
        name: "nagoya"
    }
    userSocketIDs.set(user._id.toString(), socket.id);

    console.log(userSocketIDs);


    socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {

        const messageForRealTime = {
            content: message,
            _id: uuid(),
            sender: {
                _id: user._id,
                name: user.name
            },
            chat: chatId,
            createdAt: new Date().toString()
        };

        const messageForDB = {
            content: message,
            sender: user._id,
            chat: chatId
        };

        const membersSockets = getSockets(members);
        io.to(membersSockets).emit(NEW_MESSAGE, {
            chatId,
            message: messageForRealTime
        });

        io.to(membersSockets).emit(NEW_MESSAGE_ALERT, {
            chatId
        });

        try {
            await Message.create(messageForDB);

        } catch (error) {
            console.error(error.message)
        }
        console.log("new message", messageForRealTime)

    })

    socket.on("disconnect", () => {
        console.log("User disconnected");
        userSocketIDs.delete(user._id.toString());
    });
})

app.use(errorMiddleware);

server.listen(port, () => {
    console.log(`port is running on ${port} in ${envMode} MODE`)
});