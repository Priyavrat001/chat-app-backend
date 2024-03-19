import { faker, simpleFaker } from "@faker-js/faker";
import { User } from "../model/user.js";
import { Chat } from "../model/chat.js";
import { Message } from "../model/message.js";

export const createUser = async (numUsers) => {
    try {

        const userPromise = [];

        for (let i = 0; i < numUsers; i++) {
            const temptUser = User.create({
                name: faker.person.fullName(),
                username: faker.internet.userName(),
                bio: faker.lorem.sentence(10),
                password: "password",
                avatar: {
                    url: faker.image.avatar(),
                    public_id: faker.system.fileName()
                }
            });

            userPromise.push(temptUser);

        }

        await Promise.all(userPromise);

        console.log("users created", numUsers)

        process.exit(1);

    } catch (error) {
        console.error(error);
        process.exit(1)

    }
}


export const createSampleSingleChat = async (newChat) => {
    try {
        const users = await User.find().select("_id");

        const chatPromise = [];

        for (let i = 0; i < users.length; i++) {
            for (let j = i; j < users.length; j++) {
                chatPromise.push(
                    Chat.create({
                        name: faker.lorem.words(2),
                        members: [users[i], users[j]]
                    })
                )

            }

        }

        await Promise.all(chatPromise);

        console.log("chat created", newChat)

        process.exit(1);
    } catch (error) {
        console.error(error);
        process.exit(1)
    }
}

export const createSampleGroupChat = async (newChat) => {
    try {
        const users = await User.find().select("_id");

        const chatPromise = [];

        for (let i = 0; i < newChat.length; i++) {
            
            const numMembers = simpleFaker.number.int({min:3, max:users.length})

            const members = [];

            for (let i = 0; i < numMembers.length; i++) {
                const randomIndex = Math.floor(Math.random() * users.length)
                
                const randomUsers = users[randomIndex];

                if(!members.includes(randomUsers)){
                    members.push(randomUsers);
                }
            }

            const chat = Chat.create({
                groupChat:true,
                name: faker.lorem.words(1),
                members,
                creator:members[0]
            })
            chatPromise.push(chat)
        }

        await Promise.all(chatPromise);

        console.log("chat created", newChat)

        process.exit(1);
    } catch (error) {
        console.error(error);
        process.exit(1)
    }
};

export const createSampleMessage = async(newMessage)=>{
    try {
        const users = await User.find("_id");
        const chats = await Chst.find("_id");

        const messagePromise = [];

        for (let i = 0; i < newMessage.length; i++) {
            const reandomUsers = users[Math.floor(Math.random() * users.length)]

            const randomChats = chats[Math.floor(Math.random() * chats.length)];

            messagePromise.push(
                Message.create({
                    chat:randomChats,
                    sender:reandomUsers,
                    content:faker.lorem.sentence()
                })
            )
            
        }
        await Promise.all(messagePromise);

        console.log("Message created", newMessage)

        process.exit(1);
    } catch (error) {
        console.error(error);
        process.exit(1)
    }
}
export const createSampleChatMessage = async(chatId, newMessage)=>{
    try {
        const users = await User.find().select("_id");

        const messagePromise = [];

        for (let i = 0; i< newMessage.length; i++) {
            const reandomUsers = users[Math.floor(Math.random() * users.length)]

            messagePromise.push(
                Message.create({
                    chat:chatId,
                    sender:reandomUsers,
                    content:faker.lorem.sentence()
                })
            )
            
        }
        await Promise.all(messagePromise);

        console.log("Message in chat created", newMessage)

        process.exit(1);
    } catch (error) {
        console.error(error);
        process.exit(1)
    }
}