import { TryCatch } from "./error.js";

export const isAuthenticated = TryCatch(async(req, res, next)=>{
console.log(req.cookies.token)

next()
});