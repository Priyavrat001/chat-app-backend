import express from "express";
import { body } from "express-validator";
import {
  askChatHistory,
  getConversationSummary,
  getReplySuggestions,
} from "../../controller/ai/ai.controller.js";
import { isAuthenticated } from "../../middlewares/auth.js";
import { validateHandler } from "../../utils/validator.js";

const app = express.Router();

app.use(isAuthenticated);

const chatIdValidator = body("chatId")
  .isMongoId()
  .withMessage("Please provide a valid chat ID.");

app.post(
  "/reply-suggestions",
  chatIdValidator,
  validateHandler,
  getReplySuggestions,
);

app.post(
  "/summarize",
  chatIdValidator,
  validateHandler,
  getConversationSummary,
);

app.post(
  "/ask-history",
  chatIdValidator,
  body("question")
    .isString()
    .withMessage("Please provide a question.")
    .trim()
    .notEmpty()
    .withMessage("Please provide a question.")
    .isLength({ max: 500 })
    .withMessage("Question cannot exceed 500 characters."),
  validateHandler,
  askChatHistory,
);

export default app;
