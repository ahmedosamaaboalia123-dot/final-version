const { aiApiKey, aiModel } = require("../../config/env");
const { definitions, executors, publicToolNames } = require("./chat.tools");

const PUBLIC_SYSTEM_PROMPT = `
You are "404 Coffee" assistant, a helpful Arabic/English customer support bot for a coffee shop.
You can answer general questions about coffee, the shop, opening hours, and the menu.
When the user asks about products or the menu, use the available tools to get real data, then answer based on it.
Be friendly, concise and clear. Respond in the same language as the user.
`;

const STAFF_SYSTEM_PROMPT = `
You are "404 Coffee" AI assistant for the shop's staff and management (Arabic/English).
You have access to real business data through tools (products, inventory, sales, orders, dashboard).
Use the tools to answer questions about the menu, low stock, sales totals, order statuses, and daily summaries.
If a tool returns data, answer based on that real data. If you cannot find an answer, say so honestly.
Be concise and professional. Respond in the same language as the user.
`;

const MAX_TOOL_ROUNDS = 3;

const validateMessages = (messages) => {
    if (!Array.isArray(messages) || messages.length === 0) {
        const error = new Error(
            "messages array with at least one message is required"
        );
        error.statusCode = 400;
        throw error;
    }

    return messages.map((message) => {
        const role =
            message.role === "assistant" ? "assistant" : "user";

        const content =
            typeof message.content === "string"
                ? message.content
                : String(message.content || "");

        return { role, content };
    });
};

const callDeepSeek = async (body) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
        const response = await fetch(
            "https://api.deepseek.com/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${aiApiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(
                `DeepSeek API error (${response.status}): ${errorText.slice(0, 300)}`
            );
            error.statusCode = 502;
            throw error;
        }

        return response.json();
    } finally {
        clearTimeout(timeout);
    }
};

const executeToolCalls = async (toolCalls) => {
    const results = [];

    for (const toolCall of toolCalls) {
        const { name, arguments: rawArgs } = toolCall.function;

        let args = {};
        try {
            args = rawArgs ? JSON.parse(rawArgs) : {};
        } catch {
            args = {};
        }

        let content = "Tool not available";

        try {
            if (executors[name]) {
                content = await executors[name](args);
            }
        } catch (error) {
            content = `Tool error: ${error.message}`;
        }

        results.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: String(content).slice(0, 20000),
        });
    }

    return results;
};

const chatWithAssistant = async ({ messages, isStaff }) => {
    const history = validateMessages(messages);

    if (!aiApiKey) {
        const error = new Error(
            "DeepSeek API key is not configured (DEEPSEEK_API_KEY)"
        );
        error.statusCode = 500;
        throw error;
    }

    const tools = isStaff
        ? definitions
        : definitions.filter((tool) =>
              publicToolNames.includes(tool.function.name)
          );

    const messagesPayload = [
        {
            role: "system",
            content: isStaff ? STAFF_SYSTEM_PROMPT : PUBLIC_SYSTEM_PROMPT,
        },
        ...history,
    ];

    let currentMessages = messagesPayload;

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const data = await callDeepSeek({
            model: aiModel,
            messages: currentMessages,
            tools,
            tool_choice: "auto",
        });

        const message = data.choices?.[0]?.message;

        if (!message) {
            const error = new Error("DeepSeek returned an empty response");
            error.statusCode = 502;
            throw error;
        }

        if (message.tool_calls?.length) {
            const toolResults = await executeToolCalls(message.tool_calls);

            currentMessages = [
                ...currentMessages,
                {
                    role: "assistant",
                    content: message.content || null,
                    tool_calls: message.tool_calls,
                },
                ...toolResults,
            ];

            continue;
        }

        return {
            content: message.content || "",
            usage: data.usage || null,
        };
    }

    const error = new Error("Assistant exceeded the maximum tool rounds");
    error.statusCode = 502;
    throw error;
};

module.exports = {
    chatWithAssistant,
};