import { body, param, validationResult } from "express-validator";
import { ErrorHandler } from "./utility.js";


export const validateHandler = (req, res, next)=>{
    const errors = validationResult(req);

    const errorMessages = errors.array().map((error)=>error.msg).join(", ")

    if(errors.isEmpty()) return next();
    else next(new ErrorHandler(errorMessages, 400));
};

export const registerValidator = ()=>[
    body("name", "Please enter your name").notEmpty(),
    body("username", "Please enter your username").notEmpty(),
    body("password", "Please enter your password").notEmpty(),
    body("bio", "Please enter your bio").notEmpty(),
];

export const loginValidator = ()=>[
    body("username", "Please enter your username").notEmpty(),
    body("password", "Please enter your password").notEmpty(),
];

export const newGroupChatValidator = ()=>[
    body("name", "Please enter your name").notEmpty(),
    body("members").notEmpty().withMessage( "Please enter your members").isArray({min:2, max:100}).withMessage("Members must be 2 to 100"),
];

export const addMemberValidator = ()=>[
    body("chatId", "Please enter your chat id").notEmpty(),
    body("members").notEmpty().withMessage( "Please enter your members").isArray({min:1, max:97}).withMessage("Members must be 1 to 100"),
];

export const removeValidator = ()=>[
    body("chatId", "Please enter your chat id").notEmpty(),
    body("userId", "Please enter your user id").notEmpty(),

];

export const sendAttachmentValidator = ()=>[
    body("chatId", "Please enter your chat id").notEmpty(),

];

export const chatIdValidator = ()=>[
    param("id", "Please enter your chat id").notEmpty(),
];

export const renameValidator = ()=>[
    param("id", "Please enter your chat id").notEmpty(),
    body("name", "Please enter new name").notEmpty(),
];

export const sendRequestValidator = ()=>[
    body("userId", "Please enter user id").notEmpty(),
];

export const acceptRequestValidator = ()=>[
    body("requestId", "Please enter request id").notEmpty(),
    body("accept").notEmpty().withMessage("Please add accept").isBoolean().withMessage("Accept must be boolean"),
];

export const adminLoginValidator = ()=>[
    body("secretKey", "Please enter secret key").notEmpty(),
];