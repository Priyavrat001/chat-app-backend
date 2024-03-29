import dotenv from "dotenv";

dotenv.config();


export const corsOptions = {
    origin: [
      "http://localhost:5173",
      "http://localhost:4173",
      process.env.CLIENT_URL,
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  };
  
 export const CHAT_APP= "chat-app";

 export const CHAT_APP_ADMIN_TOKEN = "chat-app-admin-token"