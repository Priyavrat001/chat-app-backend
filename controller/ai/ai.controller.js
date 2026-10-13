import {
  answerChatHistoryQuestion,
  summarizeConversation,
  suggestReplies,
} from "../../services/ai.service.js";
import { TryCatch } from "../../middlewares/error.js";

export const getReplySuggestions = TryCatch(async (req, res) => {

  const suggestions = await suggestReplies(req.body.chatId, req.user);
  return res.status(200).json({ success: true, suggestions });

});

export const getConversationSummary = TryCatch(async (req, res) => {

  const summary = await summarizeConversation(req.body.chatId, req.user);
  return res.status(200).json({ success: true, ...summary });

});

export const askChatHistory = TryCatch(async (req, res) => {

  const result = await answerChatHistoryQuestion(
    req.body.chatId,
    req.user,
    req.body.question.trim(),
  );
  
  return res.status(200).json({ success: true, ...result });
});
