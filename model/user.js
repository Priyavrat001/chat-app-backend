import mongoose from "mongoose";
import bcrypt from "bcrypt";

const schema = new mongoose.Schema({
    name:{
        type:String,
        required:true
    },
    bio:{
        type:String,
        required:true
    },
    username:{
        type:String,
        required:true,
        unique:true
    },
    email:{
        type:String,
        lowercase:true,
        trim:true,
        sparse:true,
        unique:true
    },
    role:{
        type:String,
        enum:["user", "moderator"],
        default:"user"
    },
    status:{
        type:String,
        enum:["active", "suspended", "deactivated"],
        default:"active"
    },
    lastSeenAt:Date,
    password:{
        type:String,
        required:true,
        select:false
    },

    avatar:{
        public_id:{
            type:String,
            required:true
        },
        url:{
            type:String,
            required:true
        },
    }

},{
    timestamps:true
});

schema.pre("save", async function(next){
    if(!this.isModified("password")) return next();
   this.password = await bcrypt.hash(this.password, 10)
})

export const User = mongoose.models.User || mongoose.model("User", schema);