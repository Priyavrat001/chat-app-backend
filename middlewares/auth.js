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

    User.findById(req.user).select("status").then((user) => {
        if (!user || user.status !== "active")
            return next(new ErrorHandler("This account is not active.", 403));
        next();
    }).catch(next);

};

export const adminOnly = (req, res, next) => {

    const token = req.cookies[CHAT_APP_ADMIN_TOKEN];

    if (!token) return next(new ErrorHandler("Only admin access this route.", 401));

    const { secretKey } = jwt.verify(token, process.env.JWT_SECRET)

    const isMatch = secretKey === adminSecretKey;

    if (!isMatch) return next(new ErrorHandler("Only admin access this route.", 401));

    req.adminActor = "admin";
    next();

};

export const adminOrModerator = async (req, res, next) => {
    const adminToken = req.cookies[CHAT_APP_ADMIN_TOKEN];
    if (adminToken) {
        try {
            if (jwt.verify(adminToken, process.env.JWT_SECRET)?.secretKey === adminSecretKey) {
                req.adminActor = "admin";
                return next();
            }
        } catch {
            // A moderator may also have a stale admin cookie; continue with user auth.
        }
    }

    const userToken = req.cookies[CHAT_APP];
    if (!userToken) return next(new ErrorHandler("Moderator access is required.", 401));

    try {
        const decodedData = jwt.verify(userToken, process.env.JWT_SECRET);
        const user = await User.findById(decodedData._id).select("role status");
        if (!user || user.status !== "active")
            return next(new ErrorHandler("This account is not active.", 403));
        if (user.role !== "moderator")
            return next(new ErrorHandler("Moderator access is required.", 403));

        req.user = user._id;
        req.adminActor = `moderator:${user._id}`;
        return next();
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError)
            return next(new ErrorHandler("Please login to access this route.", 401));
        return next(error);
    }
};


export const socketAuthenticator = async(err, socket, next)=>{

    try {

        if(err)return next(err);

        const authToken = socket.request.cookies[CHAT_APP];

        if (!authToken) return next(new ErrorHandler("Please login to access this route.", 401));

        const decodedData = jwt.verify(authToken, process.env.JWT_SECRET);

        const user = await User.findById(decodedData._id);

        if(!user) return next(new ErrorHandler("Please Login to access this route", 401))
        if(user.status !== "active")
            return next(new ErrorHandler("This account is not active.", 403))

        socket.user = user;

        return next();
        
    } catch (error) {
        console.log(error);
        return next(new ErrorHandler("Please Login to access this route", 401))
        
    }
}