import { TryCatch } from "../middlewares/error.js";
import { Chat } from "../model/chat.js";
import { User } from "../model/user.js";
import { Message } from "../model/message.js";
import dotenv from "dotenv";
import { ErrorHandler } from "../utils/utility.js"
import jwt from "jsonwebtoken";
import { cookieOptions } from "../utils/features.js"
import { adminSecretKey } from "../app.js";

dotenv.config();


export const adminLogin = TryCatch(async (req, res, next) => {

    const { secretKey } = req.body;

    const isMatched = secretKey === adminSecretKey;
  
    if (!isMatched) return next(new ErrorHandler("Invalid Admin Key", 401));
  
    const token = jwt.sign(secretKey, process.env.JWT_SECRET);
  
    return res
      .status(200)
      .cookie("chat-app-admin-token", token, {
        ...cookieOptions,
        maxAge: 1000 * 60 * 15,
      })
      .json({
        success: true,
        message: "Authenticated Successfully, Welcome Admin",
      });
});

export const adminLogout = TryCatch(async (req, res, next) => {

    res.status(200).cookie("chat-app-admin-token", "", {
        ...cookieOptions,
        maxAge: 0
    }).json({
        success: true,
        message: "Admin logout succesfully"
    });
});

export const getAdminData = TryCatch(async (req, res, next) => {

    return res.status(200).json({admin: true });    
  
});

export const getAllUsers = TryCatch(async (req, res, next) => {
    const users = await User.find({});

    const transformUsers = await Promise.all(
        users.map(async ({ name, username, avatar, _id }) => {

            // Some how this logic for the count groups and friends is not working 

            // const [friends, groups] = await Promise.all([
            //     Chat.countDocuments({groupChat:false, members:_id}),
            //     Chat.countDocuments({groupChat:true, members:_id})
            // ])

            return {
                name,
                username,
                avatar: avatar.url,
                _id,
                // this logic work well
                friends: !Chat.groupChat === true ? await Chat.countDocuments({ members: _id }) : 0,
                groups: !Chat.groupChat === false ? await Chat.countDocuments({ members: _id }) : 0,
            }
        })
    )


    res.status(200).json({ success: true, users: transformUsers });
});

export const allChats = TryCatch(async (req, res, next) => {

    const chats = await Chat.find({}).populate("members", "name avatar").populate("creator", "name avatar");

    const transformChat = await Promise.all(
        chats.map(async ({ members, _id, groupChat, name, creator }) => {

            const totalMessages = await Message.countDocuments({ chat: _id })

            return {
                _id,
                name,
                groupChat:groupChat,
                avatar: members.slice(0, 3).map((member) => member.avatar.url),
                members: members.map(({ _id, name, avatar }) => (
                    {
                        _id,
                        name,
                        avatar: avatar.url
                    }
                )),

                creator: {
                    name: creator?.name || "None",
                    avatar: creator?.avatar.url || "",
                },
                totalMembers: members.length,
                totalMessages
            }
        })
    )

    res.status(200).json({ success: true, allChats: transformChat });
});

export const getAllMessages = TryCatch(async (req, res, next) => {

    const messages = await Message.find({})
    .populate("sender", "name avatar")
    .populate("chat", "groupChat");

  const transformedMessages = messages.map(
    ({ content, attachments, _id, sender, createdAt, chat }) => ({
      _id,
      attachments,
      content,
      createdAt,
      chat: chat?._id,
      groupChat: chat?.groupChat,
      sender: {
        _id: sender._id,
        name: sender.name,
        avatar: sender.avatar.url,
      },
    })
  );

  return res.status(200).json({
    success: true,
    messages: transformedMessages,
  });
});

export const getDashboardStats = TryCatch(async (req, res, next) => {

    const [groupsCount, usersCount, messagesCount, totalChatsCount] = await Promise.all([
        Chat.countDocuments({ groupChat: true }),
        User.countDocuments(),
        Message.countDocuments(),
        Chat.countDocuments(),
    ])


    const today = new Date();

    const last7Days = new Date();

    last7Days.setDate(last7Days.getDate() - 7);

    const messages = new Array(7).fill(0);

    const last7DaysMessages = await Message.find({
        createdAt: {
            $gte: last7Days,
            $lte: today
        }
    }).select("createdAt");

    const dayInMiliseconds = 1000 * 60 * 60 * 24

    last7DaysMessages.forEach((message) => {
        const indexApprox = (today.getTime() - message.createdAt.getTime()) / (dayInMiliseconds);

        const index = Math.floor(indexApprox);

        messages[6 - index]++;
    })

    const stats = { groupsCount, usersCount, messagesCount, totalChatsCount, messagesChart: messages }
    res.status(200).json({ success: true, stats });
});