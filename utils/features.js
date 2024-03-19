import mongoose from "mongoose";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

export const cookieOptions = {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: "none",
    httpOnly: true
}

export const connectDB = () => {
    const url = process.env.MONGO_URI;

    mongoose.connect(url).then(() => console.log("mongodb is connected")).catch((err) => console.error(err.message))
};

export const sendToken = (res, user, code, message) => {
    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);

    return res.status(code).cookie("chat-app", token, cookieOptions).json({ success: true, message })
};

export const sendResponse = (res, message, statusCode)=>{
   
    return res.status(statusCode).json({success:true, message:message});

    
};


export const emitEvent = (req, event, users, data) => { 
    console.log("emmeting event", event)
};


export const deleteFilesFromCloudinary = async (public_id)=>{
    
}