import {body, check, validationResult} from "express-validator";
import { ErrorHandler } from "./utility.js";


export const validateHandler = (req, res, next)=>{
    const errors = validationResult(req);

    const errorMessages = errors.array().map((error)=>error.msg).join(", ")

    if(errors.isEmpty()) return next();
    else next(new ErrorHandler(errorMessages, 400))
};

export const registerValidator = ()=>[
    body("name", "Please enter your name").notEmpty(),
    body("useranme", "Please enter your username").notEmpty(),
    body("password", "Please enter your password").notEmpty(),
    body("bio", "Please enter your bio").notEmpty(),
    check("avatar").notEmpty().withMessage("Please upload avatar")
];

export const loginValidator = ()=>[
    body("useranme", "Please enter your username").notEmpty(),
    body("password", "Please enter your password").notEmpty(),
];

export const newGroupChatValidator = ()=>[
    body("nanme", "Please enter your name").notEmpty(),
    body("members").notEmpty().withMessage( "Please enter your members").isArray({min:2, max:100}).withMessage("Members must be 2 to 100"),
];
