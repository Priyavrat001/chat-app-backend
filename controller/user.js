import { compare } from "bcrypt";
import { User } from "../model/user.js";
import { sendToken } from "../utils/features.js";
import { TryCatch } from "../middlewares/error.js";
import {ErrorHandler} from "../utils/utility.js"


// Create new user and saving in the database and adding cookie and saving user data in cookie
export const newUsers = TryCatch(async (req, res, next) => {
    const { name, username, password, bio } = req.body;

        const avatar = {
            public_id: "dsdfd",
            url: "fdsfd"
        }

        
        const user = await User.create({
            name,
            bio,
            username,
            password,
            avatar
        })
        if(user) return next(new ErrorHandler("User is Alreday exsit", 404))

        sendToken(res, 201, "User created successfully")
});

export const login = async (req, res, next) => {

    try {
        const { username, password } = req.body

        if (!username || !password) return next(new ErrorHandler("Invalid usename or password", 404));

        const user = await User.findOne({ username }).select("+password");

        if (!user) return next(new ErrorHandler("Invalid usename or password", 404));

        const isMatchedPasswrod = await compare(password, user.password);

        if (!isMatchedPasswrod) return next(new ErrorHandler("Invalid username or password", 404));

        sendToken(res, user, 200, `Welcome Back ${user.name}`)
    } catch (error) {
        next(error)
    }
};

// Todo

export const getMyProfile = TryCatch(async(req, res, next)=>{
    // const {id} = req.query;
    res.send("working")
    // const user = await User.findById({id})
})


export const deleteUser = async (req, res) => {
    try {
        const { id } = req.query;
        const user = await User.findByIdAndDelete(id);
        if (!user) {
            res.status(400).json({ success: false, message: "not able to find the user on this id" })
        }
        res.status(200).json({ success: true, message: "user is deleted successfully" })
    } catch (error) {
        res.status(400).json({ success: false, message: error })
    }
}