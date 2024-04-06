import { compare } from "bcrypt";
import { NEW_REQUEST, REFETCH_CHATS } from "../constants/event.js";
import { TryCatch } from "../middlewares/error.js";
import { Chat } from "../model/chat.js";
import { Request } from "../model/request.js";
import { User } from "../model/user.js";
import { cookieOptions, emitEvent, sendResponse, sendToken, uploadFilesToCloudinary } from "../utils/features.js";
import { ErrorHandler } from "../utils/utility.js";

// Create new user and saving in the database and adding cookie and saving user data in cookie
export const newUsers = TryCatch(async (req, res, next) => {
    const { name, username, password, bio } = req.body;
  
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
  
    sendToken(res, user, 200, `Welcome Back, ${user.name}`);
  });

export const getMyProfile = TryCatch(async (req, res, next) => {

    const user = await User.findById(req.user);

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

    const chats = await Chat.find({ members: req.user }).populate("members", "name avatar");

    const friends = chats.map(({ members }) => {
        const otherUser = members.find((member) => member._id !== req.user);

        return {
            _id: otherUser._id,
            name: otherUser.name,
            avatar: otherUser.avatar.url
        }
    });

    if (chatId) {
        const chat = await Chat.findById(chatId);

        const avilableFriends = friends.filter(
            (friend) => !chat.members.includes(friend._id)
        );

        return res.status(200).json({ success: true, avilableFriends })
    } else {

        return res.status(200).json({ success: true, friends })
    }

})