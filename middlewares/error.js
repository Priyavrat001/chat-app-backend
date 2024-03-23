import dotenv from "dotenv";
import { envMode } from "../app.js";

dotenv.config();

export const errorMiddleware = (err, req, res, next) => {
    err.message ||= "Internal Server Error"
    err.statusCode ||= 500;

    if (err.code === 11000) {

        const error = Object.keys(err.keyPattern).join(",")

        err.message = `Duplicate field - ${error}`
        err.statusCode = 400;
    }

    if (err.name === "CastError") {

        const errorPath = err.path

        err.message = `Invalid format of - ${errorPath}`
        err.statusCode = 400;
    };

    const developmentProcess = envMode === "DEVELOPMENT" ? err : err.message;

    return res.status(err.statusCode).json({ success: false, message: developmentProcess });
};


export const TryCatch = (func) => async (req, res, next) => {
    try {
        await func(req, res, next);
    } catch (error) {
        next(error)
    }

};