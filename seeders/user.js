import {faker} from "@faker-js/faker";
import { User } from "../model/user.js";

export const createUser = async (numUsers)=>{
    try {

        const userPromise = [];

        for (let i = 0; i < numUsers; i++) {
            const temptUser = User.create({
                name:faker.person.fullName(),
                username:faker.internet.userName(),
                bio:faker.lorem.sentence(10),
                password:"password",
                avatar:{
                    url:faker.image.avatar(),
                    public_id:faker.system.fileName()
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