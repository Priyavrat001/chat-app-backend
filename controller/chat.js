import { TryCatch } from "../middlewares/error.js";
import { ErrorHandler } from "../utils/utility.js";
import {Chat} from "../model/chat.js"
import { emitEvent } from "../utils/features.js";
import { ALERT, REFETCH_CHATS } from "../constants/event.js";
import { getOtherMembers } from "../lib/helper.js";

export const newGroupChat = TryCatch(async (req, res, next)=>{
    const {name, members} = req.body;

    if(members.length<2) return next(new ErrorHandler("Group chat must have atleast 3 members", 400));

    const allMembers = [...members, req.user];

    await Chat.create({
        name,
        groupChat:true,
        creator:req.user,
        members:allMembers
    });

    emitEvent(req, ALERT, allMembers, `Welcome to ${name} group`);

    emitEvent(req, REFETCH_CHATS, members);

    return res.status(200).json({success:true, message:"Group Created"});


});

export const getMyChats = async (req, res, next)=>{
    

    const chats = await Chat.find({members:req.user}).populate(
        "members",
        "name username avatar"
    );

    const transformChat = chats.map(({_id, name, groupChat, members})=>{

        const otherMembers = getOtherMembers(members, req.user)

        return {
            _id,
            groupChat,
            
            avatar:groupChat?members.slice(0,3).map(({avatar})=>avatar.url):[otherMembers.avatar.url],
            name: groupChat ? name : otherMembers.name,
            members:members
        }
    })

    return res.status(200).json({success:true, chats:transformChat});


}