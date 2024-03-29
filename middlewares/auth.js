import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import { ErrorHandler } from "../utils/utility.js";
import { adminSecretKey } from "../app.js";
import { CHAT_APP, CHAT_APP_ADMIN_TOKEN } from "../constants/config.js";
import { User } from "../model/user.js";

dotenv.config();

export const isAuthenticated = (req, res, next) => {

    const token = req.cookies[CHAT_APP];

    if (!token) return next(new ErrorHandler("Please login to access this route.", 401));

    const decodedData = jwt.verify(token, process.env.JWT_SECRET)

    req.user = decodedData._id;

    next();

};

export const adminOnly = (req, res, next) => {

    const token = req.cookies[CHAT_APP_ADMIN_TOKEN];

    if (!token) return next(new ErrorHandler("Only admin access this route.", 401));

    const secretKey = jwt.verify(token, process.env.JWT_SECRET)

    const isMatch = secretKey === adminSecretKey;

    if (!isMatch) return next(new ErrorHandler("Only admin access this route.", 401));

    next();

};


export const socketAuthenticator = async(err, socket, next)=>{

    try {

        if(err)return next(err);

        const authToken = socket.request.cookies[CHAT_APP];

        if (!authToken) return next(new ErrorHandler("Please login to access this route.", 401));

        const decodedData = jwt.verify(authToken, process.env.JWT_SECRET);

        const user = await User.findById(decodedData._id);

        if(!user) return next(new ErrorHandler("Please Login to access this route", 401))

        socket.user = user;

        return next();
        
    } catch (error) {
        console.log(error);
        return next(new ErrorHandler("Please Login to access this route", 401))
        
    }
}