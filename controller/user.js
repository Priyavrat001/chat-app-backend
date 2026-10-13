import { compare } from "bcrypt";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/event.js";
import { TryCatch } from "../middlewares/error.js";
import { Chat } from "../model/chat.js";
import { Message } from "../model/message.js";
import { Request } from "../model/request.js";
import { User } from "../model/user.js";
import { Report } from "../model/report.js";
import { cookieOptions, emitEvent, sendResponse, sendToken, uploadFilesToCloudinary } from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";
import { getOtherMembers } from "../lib/helper.js";

// Create new user and saving in the database and adding cookie and saving user data in cookie
export const newUsers = TryCatch(async (req, res, next) => {
    const { name, username, password, bio, email } = req.body;
  
    const file = req.file;
  
    if (!file) return next(new ErrorHandler("Please Upload Avatar"));
  
    const result = await uploadFilesToCloudinary([file]);
  
    const avatar = {
      public_id: result[0].public_id,
      url: result[0].url,
    };
  
    const user = await User.create({
      name,
      bio,
      username,
      password,
      ...(email ? { email } : {}),
      avatar,
    });
  
    sendToken(res, user, 201, "User created");
  });

// Login user and save token in cookie
export const login = TryCatch(async (req, res, next) => {
    const { username, password } = req.body;
  
    const user = await User.findOne({ username }).select("+password");
  
    if (!user) return next(new ErrorHandler("Invalid Username or Password", 404));
  
    const isMatch = await compare(password, user.password);
  
    if (!isMatch)
      return next(new ErrorHandler("Invalid Username or Password", 404));

    if (user.status !== "active")
      return next(new ErrorHandler("This account is not active.", 403));

    sendToken(res, user, 200, `Welcome Back, ${user.name}`);
  });

export const getMyProfile = TryCatch(async (req, res, next) => {

    const user = await User.findById(req.user);
    if (!user || user.status !== "active")
      return next(new ErrorHandler("This account is not active.", 403));

    res.status(200).json({ success: true, user })
});


export const logout = TryCatch(async (req, res, next) => {
    return res.status(200).cookie("chat-app", "", { ...cookieOptions, maxAge: 0 }).json({ success: true, message: "Logout Sucessfully" })
});

export const searchUser = TryCatch(async (req, res, next) => {

    const { name = "" } = req.query;

    // finding all chats
    const myChats = await Chat.find({ members: req.user });

    // getting all users from my chat menas friends or people i have chated with
    const allUserFromMyChats = myChats.flatMap(chat => chat.members)

    // modifying the response
    const allUserExpectMeAndFriends = await User.find({
        _id: { $nin: allUserFromMyChats },
        name: { $regex: name, $options: "i" }
    })

    const users = allUserExpectMeAndFriends.map(({ _id, name, avatar }) => ({ _id, name, avatar: avatar.url }));

    return res.status(200).json({ success: true, users })
});

export const sendFriendRequest = TryCatch(async (req, res, next) => {
    const { userId } = req.body;

    const request = await Request.findOne({
        $or: [
          { sender: req.user, receiver: userId },
          { sender: userId, receiver: req.user },
        ],
      });
    

    if (request) return next(new ErrorHandler("Request already sent", 400))

    await Request.create({
        sender: req.user,
        receiver: userId
    });

    emitEvent(req, NEW_REQUEST, [userId]);

    return sendResponse(res, "Friend request sent", 200);

});

export const acceptFriendRequest = TryCatch(async (req, res, next) => {
    const { requestId, accept } = req.body;

    const request = await Request.findById(requestId);

    if (!request) return next(new ErrorHandler("Request not found", 400));

    if (request.receiver.toString() !== req.user.toString()) return next(new ErrorHandler("You are not authorized to accept this request", 401));

    if (!accept) {
        await request.deleteOne();

        return sendResponse(res, "Friend request rejected", 200);
    };

    const members = [request.sender._id, request.receiver._id];

    await Promise.all([
        Chat.create({
            members,
            name: `${request.sender.name}-${request.receiver.name}`
        }),

        request.deleteOne(),
    ]);

    emitEvent(req, REFETCH_CHATS, members);

    return res.status(200).json({ success: true, message: "Friend request accepted", senderId: request.sender._id })
});

export const getNotifaction = TryCatch(async (req, res, next) => {
    const request = await Request.find({ receiver: req.user }).populate(
        "sender",
        "name avatar"
    );

    const allRequest = request.map(({ _id, sender }) => ({
        _id,
        sender: {
            _id: sender._id,
            name: sender.name,
            avatar: sender.avatar.url
        }
    }))


    return res.status(200).json({ success: true, allRequest })
})

export const getMyFriends = TryCatch(async (req, res, next) => {
    const chatId = req.query.chatId;

    const chats = await Chat.find({
      members: req.user,
    //   groupChat: false,
    }).populate("members", "name avatar");
  
    const friends = chats.map(({ members }) => {
      const otherUser = getOtherMembers(members, req.user);
  
      return {
        _id: otherUser._id,
        name: otherUser.name,
        avatar: otherUser.avatar.url,
      };
    });
  
    if (chatId) {
      const chat = await Chat.findById(chatId);
  
      const availableFriends = friends.filter(
        (friend) => !chat.members.includes(friend._id)
      );
  
      return res.status(200).json({
        success: true,
        friends: availableFriends,
      });
    } else {
      return res.status(200).json({
        success: true,
        friends,
      });
    }

})

export const createReport = TryCatch(async (req, res, next) => {
    const { targetUser, targetChat, targetMessage, reason } = req.body;
    const targets = [targetUser, targetChat, targetMessage].filter(Boolean);

    if (targets.length !== 1)
      return next(new ErrorHandler("Report exactly one account, chat, or message.", 400));

    if (targetUser && targetUser.toString() === req.user.toString())
      return next(new ErrorHandler("You cannot report your own account.", 400));

    if (targetUser) {
      const sharedChat = await Chat.exists({
        members: { $all: [req.user, targetUser] },
      });
      if (!sharedChat)
        return next(new ErrorHandler("You can report only users you have chatted with.", 404));
    }

    if (targetChat) {
      const chat = await Chat.findOne({ _id: targetChat, members: req.user });
      if (!chat) return next(new ErrorHandler("Chat not found.", 404));
      if (!chat.groupChat)
        return next(new ErrorHandler("Only group conversations can be reported as a group.", 400));
    }

    if (targetMessage) {
      const message = await Message.findById(targetMessage).select("chat");
      if (!message) return next(new ErrorHandler("Message not found.", 404));
      const chat = await Chat.findOne({ _id: message.chat, members: req.user });
      if (!chat) return next(new ErrorHandler("Message not found.", 404));
    }

    if (targetUser && !(await User.exists({ _id: targetUser })))
      return next(new ErrorHandler("Account not found.", 404));

    const report = await Report.create({
      reporter: req.user,
      targetUser,
      targetChat,
      targetMessage,
      reason: reason.trim(),
    });

    return res.status(201).json({ success: true, reportId: report._id });
});