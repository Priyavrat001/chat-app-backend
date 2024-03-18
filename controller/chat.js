import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import { Chat } from "../model/chat.js"
import { emitEvent, sendResponse } from "../utils/features.js";
import { ALERT, NEW_ATTACHMENT, NEW_MESSAGE_ALERT, REFETCH_CHATS } from "../constants/event.js";
import { getOtherMembers } from "../lib/helper.js";
import { User } from "../model/user.js";
import { Message } from "../model/message.js";


export const newGroupChat = TryCatch(async (req, res, next) => {
    const { name, members } = req.body;

    if (members.length < 2) return next(new ErrorHandler("Group chat must have atleast 3 members", 400));

    const allMembers = [...members, req.user];

    await Chat.create({
        name,
        groupChat: true,
        creator: req.user,
        members: allMembers
    });

    emitEvent(req, ALERT, allMembers, `Welcome to ${name} group`);

    emitEvent(req, REFETCH_CHATS, members);

    return sendResponse(res, "Group Created", 200);


});

export const getMyChats = TryCatch(async (req, res, next) => {


    const chats = await Chat.find({ members: req.user }).populate(
        "members",
        "name username avatar"
    );

    const transformChats = chats.map(({ _id, name, groupChat, members }) => {

        const otherMembers = getOtherMembers(members, req.user)

        return {
            _id,
            groupChat,

            avatar: groupChat ? members.slice(0, 3).map(({ avatar }) => avatar.url) : [otherMembers.avatar.url],
            name: groupChat ? name : otherMembers.name,
            members: members.reduce((prev, curr) => {
                if (curr._id.toString() !== req.user.toString()) {
                    prev.push(curr._id);
                }
                return prev;
            }, [])
        }
    })

    return res.status(200).json({ success: true, transformChats });


});

export const getMyGroup = TryCatch(async (req, res, next) => {
    const chats = await Chat.find({
        members: req.user,
        creator: req.user
    }).populate("members", "name avatar");

    const groups = chats.map(({ members, _id, groupChat, name }) => ({
        _id,
        groupChat,
        name,
        avatar: members.slice(0, 3).map(({ avatar }) => avatar.url)
    }))

    res.status(200).json({
        success: true,
        groups
    })
});

export const addMembers = TryCatch(async (req, res, next) => {
    const { chatId, members } = req.body

    const chat = await Chat.findById(chatId);

    if (!members || members.length < 1) return next(new ErrorHandler("Please provide members", 400))

    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    if (chat.groupChat === false) return next(new ErrorHandler("This is not a group chat", 400));

    if (!chat.creator) return next(new ErrorHandler("Your not alowed to add members", 403));

    const allNewMembersPromise = members.map((i) => User.findById(i, "name"));

    const allNewMembers = await Promise.all(allNewMembersPromise);

    const uniqueMembers = allNewMembers.filter((i) => (
        !chat.members.includes(i._id.toString())
    )).map(i => i._id)

    chat.members.push(...uniqueMembers);

    if (chat.members.length > 100) {
        return next(new ErrorHandler("Group members limit reached to max", 400));
    }

    await chat.save();

    const allUserName = allNewMembers.map(i => i.name).join(",");

    emitEvent(
        req,
        ALERT,
        chat.members,
        `${allUserName} has been added to ${chat.name} group`
    );

    emitEvent(req, REFETCH_CHATS, chat.members, chat.name, allUserName)

    return sendResponse(res, "Members added successfully", 200)
});

export const removeMembers = TryCatch(async (req, res, next) => {
    const { userId, chatId } = req.body;

    const [chat, removeUser] = await Promise.all([
        Chat.findById(chatId),
        User.findById(userId, "name")
    ]);


    if (!chat.members || chat.members.length < 1) return next(new ErrorHandler("Please provide members", 400))

    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    if (chat.groupChat === false) return next(new ErrorHandler("This is not a group chat", 400));

    if (!chat.creator) return next(new ErrorHandler("Your not alowed to add members", 403));

    if (chat.members.length <= 3) return next(new ErrorHandler("Group must have atleast three members", 400));

    chat.members = chat.members.filter(
        (member) => member.toString() !== userId.toString()
    );

    await chat.save();

    emitEvent(
        req,
        ALERT,
        chat.members,
        `${removeUser.name} has been added to ${chat.name} group`
    );

    emitEvent(req, REFETCH_CHATS, chat.members)


    return sendResponse(res, "Members removed successfully", 200);
})

export const leaveGroup = TryCatch(async (req, res, next) => {
    const chatId = req.params.id;

    console.log(chatId)

    const chat = await Chat.findById(chatId);


    if (!chat.members || chat.members.length < 1) return next(new ErrorHandler("Please provide members", 400))

    if (!chat) return next(new ErrorHandler("Chat not found", 404));

    const remainigMember = chat.members.filter(
        (member) => member.toString() !== req.user.toString()
    )

    if (remainigMember.length <= 3) return next(new ErrorHandler("Group must have atleast 3 members", 400));

    if (chat.creator.toString() === req.user.toString()) {

        const randomElement = Math.floor(Math.random() * remainigMember.length);

        const newCreator = remainigMember[randomElement];

        chat.creator = newCreator
    }

    chat.members = remainigMember;

    const [user] = await Promise.all([
        User.findById(req.user, "name"),
        chat.save(),
    ]);


    emitEvent(
        req,
        ALERT,
        chat.members,
        `${user.name} has left group`
    );

    return sendResponse(res, "Leaved group successfully", 200)
});

export const sendAttachment = TryCatch(async (req, res, next) => {

    const { chatId } = req.body;

    const [chat, me] = await Promise.all([
        Chat.findById(chatId),
        User.findById(req.user, "name")
    ]);

    const files = req.files || [];


    if (!chat) return next(new ErrorHandler("Not able to find the chat", 404));

    if (files.length < 1) return next(new ErrorHandler("Please provide attachment", 400));
    // upload files here;
    const attachments = [];

    
    const messageForDB = {
        content: "",
        attachments,
        sender: me._id,
        chat:chatId
    };
    const messageForRealTime = {
        ...messageForDB,
        sender: {
            _id:me._id,
            name:me.name
        }
    };

    const message = await Message.create(messageForDB);

    emitEvent(req, NEW_ATTACHMENT, chat.members, {
        message:messageForRealTime,
        chatId
    });

    emitEvent(req, NEW_MESSAGE_ALERT, chat.members, {chatId})

    return sendResponse(res, message, 200);
});

export const getChatDetails = (TryCatch(async (req, res, next)=>{

    if(req.query.populate === "true"){

        const chat = await Chat.findById(req.params.id).populate("members", "name avatar").lean();

        if (!chat) return next(new ErrorHandler("Not able to find the chat", 404));

        chat.members = chat.members.map(
            ({_id, avatar, name})=>({
                _id,
                name,
                avatar:avatar.url
            })
        )

        return res.status(200).json({success:true, chat});


    }else{
        const chat = await Chat.findById(req.params.id);

        if (!chat) return next(new ErrorHandler("Not able to find the chat", 404));

        return res.status(200).json({success:true, chat});
    }
}))