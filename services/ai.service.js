import mongoose from "mongoose";

import { Chat } from "../model/chat.js";
import { Message } from "../model/message.js";
import { ErrorHandler } from "../utils/utility.js";
import {
  buildChatHistoryAnswerPrompt,
  buildConversationSummaryPrompt,
  buildReplySuggestionsPrompt,
} from "../utils/ai/aiPrompts.js";

const GEMINI_API_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_MESSAGE_LENGTH = 2000;
const HISTORY_SCAN_LIMIT = 500;
const HISTORY_CONTEXT_LIMIT = 20;

// Ignore common words so history search favors meaningful query terms.
const STOP_WORDS = new Set([
  "about", "after", "again", "before", "being", "between", "could", "did",
  "does", "from", "have", "here", "into", "just", "more", "most", "once",
  "only", "other", "over", "same", "should", "some", "than", "that", "their",
  "them", "there", "these", "they", "this", "those", "through", "under",
  "very", "what", "when", "where", "which", "while", "with", "would", "your",
]);

// Keep provider context small and include only fields needed by the prompts.
const toPromptMessages = (messages) =>
  messages.map((message) => ({
    id: message._id.toString(),
    sender: message.sender?.name || "Unknown participant",
    createdAt: message.createdAt.toISOString(),
    content: (message.content || "").slice(0, MAX_MESSAGE_LENGTH),
  }));

// Parse model output as JSON and return a client-safe error if it is malformed.
const parseGeminiJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    throw new ErrorHandler("The AI provider returned an invalid response.", 502);
  }
};

// Send one bounded request to Gemini and normalize provider failures for the API.
const generateJson = async (prompt) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ErrorHandler("AI features are not configured on this server.", 503);
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url =
    `${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent` +
    `?key=${encodeURIComponent(apiKey)}`;

  let response;

  try {
    for(let attemp = 0; attemp<=3; attemp++){
      response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    });
    }
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      throw new ErrorHandler("The AI provider request timed out.", 504);
    }
    throw new ErrorHandler("Unable to reach the AI provider.", 502);
  }

  // Read the body once so provider errors and successful JSON share the same path.
  const responseText = await response.text();
  let payload;

  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new ErrorHandler("The AI provider returned an invalid response.", 502);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ErrorHandler("The AI service is busy. Please try again shortly.", 503);
    }
    if (response.status >= 500) {
      throw new ErrorHandler("The AI service is temporarily unavailable.", 503);
    }
    throw new ErrorHandler("The AI request could not be processed.", 502);
  }

  const generatedText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  if (!generatedText) {
    throw new ErrorHandler("The AI provider returned an empty response.", 502);
  }

  return parseGeminiJson(generatedText);
};

// Verify chat membership before loading any messages for an AI request.
const getRecentConversation = async (chatId, userId, limit) => {
  if (!mongoose.Types.ObjectId.isValid(chatId)) {
    throw new ErrorHandler("Invalid chat ID.", 400);
  }

  const chat = await Chat.findOne({
    _id: chatId,
    members: userId,
  });

  if (!chat) {
    throw new ErrorHandler(
      "Chat not found or you are not a member of this chat.",
      404,
    );
  }

  // Attach sender names for readable prompts and omit attachment-only messages.
  const messages = await Message.find({
    chat: chatId,
    content: { $exists: true, $ne: "" },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("sender", "name")
    .lean();

  return messages.reverse();
};

// Preserve the newest conversation context while respecting a prompt-size budget.
const trimContextToBudget = (messages, maxCharacters = 24000) => {
  const selected = [];
  let characterCount = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const content = (message.content || "").slice(0, MAX_MESSAGE_LENGTH);

    if (!content) continue;

    if (characterCount + content.length > maxCharacters) {
      const remaining = maxCharacters - characterCount;

      if (remaining > 100) {
        selected.push({ ...message, content: content.slice(-remaining) });
      }
      break;
    }
    selected.push({ ...message, content });
    characterCount += content.length;
  }

  return selected.reverse();
};

// Return unique, meaningful words for simple local relevance matching.
const tokenize = (text) =>
  [...new Set(
    (text.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])
      .filter((word) => !STOP_WORDS.has(word)),
  )];

export const suggestReplies = async (chatId, userId) => {
  const messages = await getRecentConversation(chatId, userId, 20);
  if (!messages.length) {
    throw new ErrorHandler("There are no recent text messages to reply to.", 400);
  }

  const result = await generateJson(
    buildReplySuggestionsPrompt(
      toPromptMessages(trimContextToBudget(messages)),
    ),
  );

  const suggestions = Array.isArray(result.suggestions)
    ? result.suggestions
      .filter((suggestion) => typeof suggestion === "string" && suggestion.trim())
      .slice(0, 3)
      .map((suggestion) => suggestion.trim())
    : [];

  if (suggestions.length !== 3) {
    throw new ErrorHandler("The AI provider did not return three reply suggestions.", 502);
  }
  return suggestions;
};

export const summarizeConversation = async (chatId, userId) => {
  const messages = await getRecentConversation(chatId, userId, 100);
  if (!messages.length) {
    throw new ErrorHandler("There are no recent text messages to summarize.", 400);
  }

  const result = await generateJson(
    buildConversationSummaryPrompt(
      toPromptMessages(trimContextToBudget(messages)),
    ),
  );

  if (typeof result.summary !== "string" || !result.summary.trim()) {
    throw new ErrorHandler("The AI provider did not return a conversation summary.", 502);
  }

  const asStringArray = (value) =>
    Array.isArray(value)
      ? value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
      : [];

  return {
    summary: result.summary.trim(),
    decisions: asStringArray(result.decisions),
    questions: asStringArray(result.questions),
    actionItems: asStringArray(result.actionItems),
  };
};

export const answerChatHistoryQuestion = async (chatId, userId, question) => {
  const allMessages = await getRecentConversation(chatId, userId, HISTORY_SCAN_LIMIT);
  const queryTerms = tokenize(question);

  if (!queryTerms.length) {
    throw new ErrorHandler("Please ask a question with specific keywords.", 400);
  }

  const relevantMessages = allMessages
    .map((message) => {
      const messageTerms = new Set(tokenize(message.content || ""));
      const score = queryTerms.reduce(
        (total, term) => total + (messageTerms.has(term) ? 1 : 0),
        0,
      );
      return { message, score };
    })
    .filter(({ score }) => score > 0)
    // Give the model the strongest matches, then restore chronological order.
    .sort((first, second) => second.score - first.score)
    .slice(0, HISTORY_CONTEXT_LIMIT)
    .map(({ message }) => message)
    .sort((first, second) => first.createdAt - second.createdAt);

  if (!relevantMessages.length) {
    return {
      answer: "I couldn't find relevant messages in the recent chat history to answer that.",
      citations: [],
      sources: [],
    };
  }

  // Only allow citations that refer to messages actually supplied to Gemini.
  const context = toPromptMessages(trimContextToBudget(relevantMessages));
  const result = await generateJson(
    buildChatHistoryAnswerPrompt(question, context),
  );

  if (typeof result.answer !== "string" || !result.answer.trim()) {
    throw new ErrorHandler("The AI provider did not return an answer.", 502);
  }

  const contextById = new Map(context.map((message) => [message.id, message]));
  const citations = Array.isArray(result.citations)
    ? [
      ...new Set(
        result.citations.filter(
          (id) => typeof id === "string" && contextById.has(id),
        ),
      ),
    ]
    : [];

  return {
    answer: result.answer.trim(),
    citations,
    sources: citations.map((id) => {
      const source = contextById.get(id);
      return {
        messageId: source.id,
        sender: source.sender,
        createdAt: source.createdAt,
        excerpt: source.content.slice(0, 300),
      };
    }),
  };
};
