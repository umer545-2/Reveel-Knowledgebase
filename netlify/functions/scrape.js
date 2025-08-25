import { readFileSync } from "fs";
import path from "path";

export const handler = async (event) => {
  try {
    const query = event.queryStringParameters?.query;
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing query parameter." }),
      };
    }

    const articlesPath = path.join(process.cwd(), "articles.json");
    let articles = [];
    try {
      const fileData = readFileSync(articlesPath, "utf-8");
      articles = JSON.parse(fileData);
    } catch (err) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Could not read articles.json" }),
      };
    }

    if (articles.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify("Knowledge base is empty."),
      };
    }

    const openAiApiKey = process.env.OPENAI_API_KEY;

    // Prepare numbered list for GPT (titles only)
    const articleList = articles
      .map((a, i) => `${i + 1}. ${a.title}`)
      .join("\n");

    const prompt = `
      IMPORTANT: If the question is NOT about Reveel or its articles, reply ONLY with: I can only answer questions about reveel. THIS IS THE ONLY VALID RESPONSE FOR IRRELEVANT QUESTIONS. DO NOT USE article-doesnt-exist FOR IRRELEVANT QUESTIONS. REPEAT: DO NOT USE article-doesnt-exist FOR IRRELEVANT QUESTIONS.
      You are a knowledge base assistant. Here is a list of article titles:
      ${articleList}

      If the question IS about Reveel but no matching article exists, reply ONLY with: article-doesnt-exist.

      Examples of irrelevant questions and their expected answer:
      Question: "What is the capital of France?"
      Answer: I can only answer questions about reveel

      Question: "Tell me a joke."
      Answer: I can only answer questions about reveel

      Question: "wsg gng"
      Answer: I can only answer questions about reveel

      Question: "yo what's up"
      Answer: I can only answer questions about reveel

      Question: "hello"
      Answer: I can only answer questions about reveel

      Question: "who is the bay harbor butcher"
      Answer: I can only answer questions about reveel

      Question: "what the helly"
      Answer: I can only answer questions about reveel

      If the question is relevant, reply ONLY with the number of the most relevant article (just the number, nothing else). If none are relevant, reply ONLY with: article-doesnt-exist.
      If the question contains extra words, typos, or repeated phrases, ignore them and focus on the main topic. Always pick the closest relevant article, even if the question is not perfectly phrased.

      Examples of relevant questions and their expected answer:
      Question: "what is reveel about"
      Answer: 7

      Question: "what is reveel gng pls tell gng plsssss"
      Answer: 7

      Question: "how do i sign up for reveel"
      Answer: 5

      Do NOT format your answer as markdown, do NOT include the title, do NOT add any extra text.
      Question: "${query}"
      `;

    const gptResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o", // Fast and cheap
          messages: [
            {
              role: "system",
              content: "You are a strict knowledge base assistant.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0,
        }),
      }
    );

    const result = await gptResponse.json();
    const answer =
      result.choices &&
      result.choices[0] &&
      result.choices[0].message &&
      result.choices[0].message.content
        ? result.choices[0].message.content.trim()
        : "";

    if (answer === "article-doesnt-exist") {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "article-doesnt-exist" }),
      };
    }
    if (answer === "I can only answer questions about reveel") {
      return {
        statusCode: 200,
        body: JSON.stringify("I can only answer questions about reveel"),
      };
    }

    const index = parseInt(answer, 10) - 1;
    if (
      isNaN(index) ||
      !articles[index] ||
      !articles[index].title ||
      !articles[index].link
    ) {
      return {
        statusCode: 200,
        body: JSON.stringify({ error: "article-doesnt-exist" }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify(
        `Here is a blog matching your question: ${articles[index].link}`
      ),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
