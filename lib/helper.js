import { userSocketIDs } from "../app.js";
import { Chat } from "../model/chat.js";

export const getOtherMembers = (members, userId) => members.find((member) => member._id.toString() !== userId.toString());

export const getSockets = (users = []) => {
    const sockets = users.map((user) => userSocketIDs.get(user.toString()));

    return sockets;
};

export const getBase64 = (file) =>
    `data:${file.mimetype};base64,${file.buffer.toString("base64")}`

// getCalledId its a second id which is user A is Calling to user B
export const getCalledId = async (chatId, userId) => {
    const chat = await Chat.findById(chatId).populate("members");

    const calledUser = chat.members.find(
        member => member._id.toString() !== userId.toString()
    );

    return calledUser?._id.toString();
};
