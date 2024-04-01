import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { v4 as uuid } from "uuid";
import { getBase64 } from "../lib/helper.js";


dotenv.config();

export const cookieOptions = {
  maxAge: 15 * 24 * 60 * 60 * 1000,
  sameSite: "none",
  // httpOnly: true,
  // secure: true,
};

export const connectDB = () => {
  const url = process.env.MONGO_URI;

  mongoose.connect(url).then(() => console.log("mongodb is connected")).catch((err) => console.error(err.message))
};

export const sendToken = (res, user, code, message) => {
  const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);

  return res.status(code).cookie("chat-app", token, cookieOptions).json({
    success: true,
    user,
    message,
  });

};

export const sendResponse = (res, message, statusCode) => {

  return res.status(statusCode).json({ success: true, message: message });


};


export const emitEvent = (req, event, users, data) => {
  console.log("emmeting event", event)
};


export const uploadFilesToCloudinary = async (files = []) => {
  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        getBase64(file),
        {
          resource_type: "auto",
          public_id: uuid(),
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
    });
  });

  try {
    const results = await Promise.all(uploadPromises);

    const formattedResults = results.map((result) => ({
      public_id: result.public_id,
      url: result.secure_url,
    }));
    return formattedResults;
  } catch (err) {
    throw new Error("Error uploading files to cloudinary", err);
  }
};

export const deleteFilesFromCloudinary = async (public_id) => {

};