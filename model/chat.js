import mongoose, { Types } from "mongoose";

const schema = new mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    groupChat:{
        type:Boolean,
        default:false
    },
    groupchat:{
        type:Boolean
    },
    creator:{
        type:Types.ObjectId,
        ref:"User"
    },
    status:{
        type:String,
        enum:["active", "restricted", "archived"],
        default:"active"
    },
    members:[{
        type:Types.ObjectId,
        ref:"User"
    }]

},{
    timestamps:true
});

schema.pre("init", function (document) {
    if (document.groupChat == null && document.groupchat != null) {
        document.groupChat = document.groupchat;
    }
});

export const Chat = mongoose.models.Chat || mongoose.model("Chat", schema);