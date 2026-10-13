import { userSocketIDs } from "../app.js";
import { Chat } from "../model/chat.js";

export const getOtherMembers = (members, userId) => members.find((member) => member._id.toString() !== userId.toString());

export const getSockets = (users = []) => {
    const sockets = users.map((user) => userSocketIDs.get(user.toString()));

    return sockets;
};

export const getMessageReceipts = async (io, chatId, senderId, members) => {
    const deliveredTo = [];
    const readBy = [];

    for (const member of members) {
        const memberId = (member._id || member).toString();
        if (memberId === senderId.toString()) continue;

        const sockets = await io.in(memberId).fetchSockets();
        if (!sockets.length) continue;

        deliveredTo.push(memberId);
        if (sockets.some((connectedSocket) =>
            connectedSocket.data.activeChatId?.toString() === chatId.toString()
        )) {
            readBy.push(memberId);
        }
    }

    return { deliveredTo, readBy };
};

export const getMessageStatus = (deliveredTo, readBy, recipientCount) => {
    if (recipientCount > 0 && readBy.length >= recipientCount) return "read";
    if (recipientCount > 0 && deliveredTo.length >= recipientCount) return "delivered";
    return "sent";
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
