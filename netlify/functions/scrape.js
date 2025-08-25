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

    const articleList = articles
      .map((a, i) => `${i + 1}. ${a.title} (${a.link})`)
      .join("\n");

    const prompt = `
      You are a knowledge base assistant. Here is a list of article titles and links:
      ${articleList}
      Based on the following question, reply ONLY with the direct URL of the most relevant article (just the link, nothing else). If none are relevant, reply ONLY with: article-doesnt-exist.
      Do NOT format your answer as markdown, do NOT include the title, do NOT use brackets or parentheses, do NOT add any extra text.
      Question: "${query}" `;

    const gptResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
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

    return {
      statusCode: 200,
      body: JSON.stringify(`Here is a blog matching your question: ${answer}`),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
