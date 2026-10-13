import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import express from "express";
import { errorMiddleware } from "./middlewares/error.js";
import { connectDB } from "./utils/features.js";
import { Server } from "socket.io";
import { createServer } from "http";
import { CHAT_JOINED, CHAT_LEAVED, MESSAGE_STATUS, NEW_MESSAGE, NEW_MESSAGE_ALERT, ONLINE_USERS, START_TYPING, STOP_TYPING } from "./constants/event.js"
import cors from "cors";
import { v2 as cloudinary } from "cloudinary";
import { getCalledId, getMessageReceipts, getMessageStatus, getSockets } from "./lib/helper.js";
import { Message } from "./model/message.js";
import { Chat } from "./model/chat.js";
import { corsOptions } from "./constants/config.js";
import { socketAuthenticator } from "./middlewares/auth.js";

import chatRoute from "./routes/chat.js";
import userRoute from "./routes/user.js";
import adminRoute from "./routes/admin.js";
import aiRoute from "./routes/ai/ai.routes.js";
import { ACCEPT_AUDIO_CALL, ACCEPT_VIDEO_CALL, END_AUDIO_CALL, END_VIDEO_CALL, ICE_CANDIDATE, NEW_AUDIO_CALL_ALERT, NEW_AUDIO_CALL_ANSWER, NEW_AUDIO_CALL_OFFER, NEW_VIDEO_CALL_ALERT, NEW_VIDEO_CALL_ANSWER, NEW_VIDEO_CALL_OFFER, VIDEO_ICE_CANDIDATE } from "./constants/events.js";
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
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
})

app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));
app.locals.apiMetrics = { requests: 0, failures: 0, totalResponseTimeMs: 0 };
app.use((req, res, next) => {
  const startedAt = Date.now();
  app.locals.apiMetrics.requests += 1;
  res.on("finish", () => {
    if (res.statusCode >= 400) app.locals.apiMetrics.failures += 1;
    app.locals.apiMetrics.totalResponseTimeMs += Date.now() - startedAt;
  });
  next();
});

app.use("/api/v1/user", userRoute);
app.use("/api/v1/chat", chatRoute);
app.use("/api/v1/admin", adminRoute);
app.use("/api/v1/ai", aiRoute);

io.use((socket, next) => {
  cookieParser()(socket.request, socket.request.resume, async (err) => {
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
  const userId = user._id.toString();

  User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } })
    .catch((error) => console.error("Unable to update user activity:", error));
  const activityInterval = setInterval(() => {
    User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } })
      .catch((error) => console.error("Unable to update user activity:", error));
  }, 5 * 60 * 1000);

  userSocketIDs.set(userId, socket.id);
  socket.join(userId);

  socket.on(NEW_MESSAGE, async ({ chatId, message }, acknowledge) => {
    try {
      const chat = await Chat.findOne({ _id: chatId, members: user._id });
      if (!chat) {
        acknowledge?.({ success: false, message: "Chat not found or access denied." });
        return;
      }
      if (chat.status && chat.status !== "active") {
        acknowledge?.({ success: false, message: "This group is not available for messaging." });
        return;
      }

      if (typeof message !== "string" || !message.trim()) {
        acknowledge?.({ success: false, message: "Message cannot be empty." });
        return;
      }

      const recipients = chat.members.filter(
        (member) => member.toString() !== userId,
      );
      const { deliveredTo, readBy } = await getMessageReceipts(
        io,
        chatId,
        userId,
        chat.members,
      );
      const savedMessage = await Message.create({
        content: message.trim(),
        sender: user._id,
        chat: chatId,
        deliveredTo,
        readBy,
      });
      const recipientCount = recipients.length;
      const messageForRealTime = {
        _id: savedMessage._id,
        content: savedMessage.content,
        sender: { _id: user._id, name: user.name },
        chat: chatId,
        createdAt: savedMessage.createdAt,
        deliveredTo,
        readBy,
        recipientCount,
        status: getMessageStatus(deliveredTo, readBy, recipientCount),
      };

      if (recipients.length) {
        const recipientIds = recipients.map((member) => member.toString());
        io.to(recipientIds).emit(NEW_MESSAGE, {
          chatId,
          message: messageForRealTime,
        });
        io.to(recipientIds).emit(NEW_MESSAGE_ALERT, { chatId });
      }
      acknowledge?.({ success: true, message: messageForRealTime });
    } catch (error) {
      console.error("Unable to save socket message:", error);
      acknowledge?.({ success: false, message: "Unable to send message." });
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

  socket.on(CHAT_JOINED, async ({ chatId } = {}) => {
    if (!chatId) return;
    try {
      const chat = await Chat.findOne({ _id: chatId, members: user._id });
      if (!chat) return;

      socket.data.activeChatId = chatId.toString();
      onlineUsers.add(userId);
      await User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } });

      const unreadMessages = await Message.find({
        chat: chatId,
        sender: { $ne: user._id },
        readBy: { $ne: user._id },
      }).lean();

      if (unreadMessages.length) {
        await Message.updateMany(
          { _id: { $in: unreadMessages.map(({ _id }) => _id) } },
          { $addToSet: { deliveredTo: user._id, readBy: user._id } },
        );

        const recipientCount = chat.members.length - 1;
        unreadMessages.forEach((message) => {
          const deliveredTo = [...new Set([...(message.deliveredTo || []).map(String), userId])];
          const readBy = [...new Set([...(message.readBy || []).map(String), userId])];
          io.to(message.sender.toString()).emit(MESSAGE_STATUS, {
            chatId: chatId.toString(),
            messageId: message._id.toString(),
            deliveredTo,
            readBy,
            recipientCount,
            status: getMessageStatus(deliveredTo, readBy, recipientCount),
          });
        });
      }

      const memberSockets = getSockets(chat.members);
      io.to(memberSockets).emit(ONLINE_USERS, Array.from(onlineUsers));
    } catch (error) {
      console.error("Unable to mark chat messages as read:", error);
    }
  });

  socket.on(CHAT_LEAVED, ({ chatId } = {}) => {
    if (!chatId || socket.data.activeChatId !== chatId.toString()) return;
    delete socket.data.activeChatId;
    onlineUsers.delete(userId);
    socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
  });

  //Audio Calling logic
  socket.on(NEW_AUDIO_CALL_ALERT, async ({ chatId, userId, calledId }) => {

    const user = await User.findById({ _id: userId });
    const calledUserId = (calledId?._id || calledId)?.toString();
    const calledUserSocketId = userSocketIDs.get(calledUserId);

    if (calledUserSocketId) {
      socket.to(calledUserSocketId).emit(NEW_AUDIO_CALL_ALERT, {
        callerInfo: user,
        chatId
      })
    }
  });

  socket.on(ACCEPT_AUDIO_CALL, ({ callerId, chatId }) => {
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

  // Video calling logic
  socket.on(NEW_VIDEO_CALL_ALERT, ({ calledId, chatId } = {}) => {
    const callerId = user._id.toString();
    const recipientId = calledId?.toString();
    const calledUserSocketId = recipientId && userSocketIDs.get(recipientId);

    if (recipientId && recipientId !== callerId && chatId && calledUserSocketId) {
      socket.to(calledUserSocketId).emit(NEW_VIDEO_CALL_ALERT, {
        callerInfo: user,
        chatId,
      });
    }
  });

  socket.on(ACCEPT_VIDEO_CALL, ({ callerId, calledId, chatId } = {}) => {
    if (calledId?.toString() !== user._id.toString()) return;

    const callerSocketId = callerId && userSocketIDs.get(callerId.toString());

    if (callerSocketId && chatId) {
      io.to(callerSocketId).emit(ACCEPT_VIDEO_CALL, {
        callerId: callerId.toString(),
        calledId: calledId.toString(),
        chatId,
      });
    }
  });

  socket.on(NEW_VIDEO_CALL_OFFER, ({ calledId, callerId, chatId, offer } = {}) => {
    if (callerId?.toString() !== user._id.toString() || !calledId || !chatId || !offer) return;

    const calledUserSocketId = userSocketIDs.get(calledId.toString());
    if (calledUserSocketId) {
      io.to(calledUserSocketId).emit(NEW_VIDEO_CALL_OFFER, {
        callerId: callerId.toString(),
        calledId: calledId.toString(),
        chatId,
        offer,
      });
    }
  });

  socket.on(NEW_VIDEO_CALL_ANSWER, ({ callerId, calledId, chatId, answer } = {}) => {
    if (calledId?.toString() !== user._id.toString() || !callerId || !chatId || !answer) return;

    const callerSocketId = userSocketIDs.get(callerId.toString());
    if (callerSocketId) {
      io.to(callerSocketId).emit(NEW_VIDEO_CALL_ANSWER, {
        callerId: callerId.toString(),
        calledId: calledId.toString(),
        chatId,
        answer,
      });
    }
  });

  socket.on(VIDEO_ICE_CANDIDATE, ({ callerId, calledId, chatId, candidate } = {}) => {
    const authenticatedUserId = user._id.toString();
    const callerUserId = callerId?.toString();
    const calledUserId = calledId?.toString();

    if (
      !callerUserId ||
      !calledUserId ||
      !chatId ||
      !candidate ||
      (authenticatedUserId !== callerUserId && authenticatedUserId !== calledUserId)
    ) return;

    const otherUserId = authenticatedUserId === callerUserId ? calledUserId : callerUserId;
    const otherUserSocketId = userSocketIDs.get(otherUserId);
    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit(VIDEO_ICE_CANDIDATE, {
        callerId: callerUserId,
        calledId: calledUserId,
        chatId,
        candidate,
      });
    }
  });

  socket.on(END_VIDEO_CALL, ({ callerId, calledId, chatId } = {}) => {
    const authenticatedUserId = user._id.toString();
    const callerUserId = callerId?.toString();
    const calledUserId = calledId?.toString();

    if (
      !callerUserId ||
      !calledUserId ||
      !chatId ||
      (authenticatedUserId !== callerUserId && authenticatedUserId !== calledUserId)
    ) return;

    const otherUserId = authenticatedUserId === callerUserId ? calledUserId : callerUserId;
    const otherUserSocketId = userSocketIDs.get(otherUserId);
    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit(END_VIDEO_CALL, {
        callerId: callerUserId,
        calledId: calledUserId,
        chatId,
      });
    }
  });

  socket.on("disconnect", () => {
    clearInterval(activityInterval);
    if (userSocketIDs.get(userId) === socket.id) userSocketIDs.delete(userId);
    User.updateOne({ _id: user._id }, { $set: { lastSeenAt: new Date() } })
      .catch((error) => console.error("Unable to update user last-seen time:", error));
    onlineUsers.delete(user._id.toString());
    socket.broadcast.emit(ONLINE_USERS, Array.from(onlineUsers));
  });
});

app.use(errorMiddleware);

server.listen(port, () => {
  console.log(`port is running on ${port} in ${envMode} MODE`)
});