import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import { errorMiddleware } from "./middlewares/error.js";
import { connectDB } from "./utils/features.js";
import { Server } from "socket.io";
import { createServer } from "http";
import { CHAT_JOINED, CHAT_LEAVED, NEW_MESSAGE, NEW_MESSAGE_ALERT, ONLINE_USERS, START_TYPING, STOP_TYPING } from "./constants/event.js"
import { v4 as uuid } from "uuid";
import cors from "cors";
import {v2 as cloudinary} from "cloudinary";
import { getCalledId, getSockets } from "./lib/helper.js";
import { Message } from "./model/message.js";
import { corsOptions } from "./constants/config.js";
import { socketAuthenticator } from "./middlewares/auth.js";

import chatRoute from "./routes/chat.js";
import userRoute from "./routes/user.js";
import adminRoute from "./routes/admin.js";
import { ACCEPT_AUDIO_CALL, END_AUDIO_CALL, ICE_CANDIDATE, NEW_AUDIO_CALL_ALERT, NEW_AUDIO_CALL_ANSWER, NEW_AUDIO_CALL_OFFER } from "./constants/events.js";
import { User } from "./model/user.js";


dotenv.config();
export const envMode = process.env.NODE_ENV === "DEVELOPEMENT" || "PRODUCTION";
export const adminSecretKey = process.env.ADMIN_SECRET_KEY || "sdfsfsfsfdsdsfsdf";
const port = process.env.PORT || 4000;
export const userSocketIDs = new Map();
const onlineUsers = new Set();

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
});

app.set("io", io);


io.use((socket, next) => {
    cookieParser()(
      socket.request,
      socket.request.res,
      async (err) => await socketAuthenticator(err, socket, next)
    );
  });
  
  io.on("connection", (socket) => {
    const user = socket.user;

    userSocketIDs.set(user._id.toString(), socket.id);
  
    socket.on(NEW_MESSAGE, async ({ chatId, members, message }) => {
      const messageForRealTime = {
        content: message,
        _id: uuid(),
        sender: {
          _id: user._id,
          name: user.name,
        },
        chat: chatId,
        createdAt: new Date().toISOString(),
      };

      const messageForDB = {
        content: message,
        sender: user._id,
        chat: chatId,
      };

      // console.log(messageForDB)
  
      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(NEW_MESSAGE, {
        chatId,
        message: messageForRealTime,
      });
      io.to(membersSocket).emit(NEW_MESSAGE_ALERT, { chatId });
  
      try {
        await Message.create(messageForDB);
      } catch (error) {
        throw new Error(error);
      }
    });
  
    socket.on(START_TYPING, ({ members, chatId }) => {
      const membersSockets = getSockets(members);
      socket.to(membersSockets).emit(START_TYPING, { chatId });
    });
  
    socket.on(STOP_TYPING, ({ members, chatId }) => {
      const membersSockets = getSockets(members);
      socket.to(membersSockets).emit(STOP_TYPING, { chatId });
    });
  
    socket.on(CHAT_JOINED, ({ userId, members }) => {
      onlineUsers.add(userId.toString());
  
      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    });
  
    socket.on(CHAT_LEAVED, ({ userId, members }) => {
      onlineUsers.delete(userId.toString());
  
      const membersSocket = getSockets(members);
      io.to(membersSocket).emit(ONLINE_USERS, Array.from(onlineUsers));
    });

    socket.on(NEW_AUDIO_CALL_ALERT, async({chatId, userId, calledId})=>{

      const user = await User.findById({_id:userId});
      const calledUserId = (calledId?._id || calledId)?.toString();
      const calledUserSocketId = userSocketIDs.get(calledUserId);

      if(calledUserSocketId){
        socket.to(calledUserSocketId).emit(NEW_AUDIO_CALL_ALERT, {
          callerInfo:user,
          chatId
        })
      }
    });

    socket.on(ACCEPT_AUDIO_CALL, ({callerId, chatId})=>{
      socket.to(
        userSocketIDs.get(callerId)
      ).emit(ACCEPT_AUDIO_CALL, {
        callerId,
        chatId
      });
    });

    // Audio call offer
socket.on(NEW_AUDIO_CALL_OFFER, ({ calledId, callerId, chatId, offer }) => {
  const calledUserSocketId = userSocketIDs.get(calledId);

  if (calledUserSocketId) {
    io.to(calledUserSocketId).emit(NEW_AUDIO_CALL_OFFER, {
      callerId,
      calledId,
      chatId,
      offer,
    });
  }
});

socket.on(NEW_AUDIO_CALL_ANSWER, ({ callerId, calledId, chatId, answer }) => {
    const callerSocketId = userSocketIDs.get(callerId);

    if (callerSocketId) {
      io.to(callerSocketId).emit(NEW_AUDIO_CALL_ANSWER, {
        callerId,
        calledId,
        chatId,
        answer,
      });
    }
  }
);

socket.on(ICE_CANDIDATE, ({ callerId, calledId, chatId, candidate }) => {
    const otherUserId = socket.user._id.toString() === callerId.toString()
      ? calledId
      : callerId;

    const otherUserSocketId = userSocketIDs.get(otherUserId);

    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit(ICE_CANDIDATE, {
        callerId,
        calledId,
        chatId,
        candidate,
      });
    }
  }
);

socket.on(END_AUDIO_CALL, ({ callerId, calledId, chatId }) => {
    const otherUserId = socket.user._id.toString() === callerId
      ? calledId
      : callerId;

    const otherUserSocketId = userSocketIDs.get(otherUserId);

    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit(END_AUDIO_CALL, {
        callerId,
        calledId,
        chatId,
      });
    }
  }
);
  
    socket.on("disconnect", () => {
      userSocketIDs.delete(user._id.toString());
      onlineUsers.delete(user._id.toString());
      socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
    });
  });

app.use(errorMiddleware);

server.listen(port, () => {
    console.log(`port is running on ${port} in ${envMode} MODE`)
});