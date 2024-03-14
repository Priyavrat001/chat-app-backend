import express from "express";
import userRoute from "./routes/user.js"
import { connectDB } from "./utils/features.js";
import dotenv from "dotenv";
import { errorMiddleware } from "./middlewares/error.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
connectDB();

app.use(express.json());

app.use("/api/v1/user", userRoute)

app.use(errorMiddleware);

app.listen(port,()=>{
    console.log(`port is running on ${port}`)
})