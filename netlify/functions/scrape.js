import { readFileSync } from "fs";
import path from "path";
import * as cheerio from "cheerio";

export const handler = async (event) => {
  try {
    const query = event.queryStringParameters?.query;
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing query parameter." }),
      };
    }

    // Read articles from local JSON file
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
        body: JSON.stringify({
          answer: "Knowledge base is empty.",
        }),
      };
    }

    const openAiApiKey = process.env.OPENAI_API_KEY;

    // Step 1: Ask GPT to pick the best article
    const titlesList = articles
      .map((a, i) => `${i + 1}. ${a.title}`)
      .join("\n");
    const selectionPrompt = `
You are a knowledge base assistant. Here is a list of article titles:
${titlesList}

Based on the following question, reply ONLY with the number of the most relevant article (do not explain your choice):

Question: "${query}"
`;

    const selectionResponse = await fetch(
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
            { role: "user", content: selectionPrompt },
          ],
          temperature: 0,
        }),
      }
    );

    const selectionResult = await selectionResponse.json();
    const selectionText =
      selectionResult.choices &&
      selectionResult.choices[0] &&
      selectionResult.choices[0].message &&
      selectionResult.choices[0].message.content
        ? selectionResult.choices[0].message.content.trim()
        : "";

    // Parse the selected article index
    const selectedIndex = parseInt(selectionText.match(/\d+/)?.[0], 10) - 1;
    const match = articles[selectedIndex];

    if (!match || !match.link) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          answer: "No relevant article found in the knowledge base.",
        }),
      };
    }

    // Step 2: Fetch and summarize the article content
    const articleRes = await fetch(match.link);
    const articleHtml = await articleRes.text();

    const $ = cheerio.load(articleHtml);
    const descSet = new Set();
    $(".fw-content--single-article p").each((i, el) => {
      const dataId = $(el).attr("data-identifyelement");
      const hasNoMargin = $(el).hasClass("no-margin");
      if (dataId !== "523" && dataId !== "520" && !hasNoMargin) {
        $(el)
          .find("span:not(:has(strong))")
          .each((j, span) => {
            const text = $(span).text().trim();
            if (text) descSet.add(text);
          });
      }
    });
    const mainContent = Array.from(descSet).join(" ");

    const summaryPrompt = `
You are an expert assistant limited to the following knowledge base article content.
Summarize the answer to the question below in a short, concise manner, using ONLY the information from the article.

Article Title: "${match.title}"
Article Content:
${mainContent}

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
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
                "You are a strict knowledge base assistant. Only answer using the provided article content.",
            },
            { role: "user", content: summaryPrompt },
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
      body: JSON.stringify(`${answer}\n\nSource: ${match.link}`),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
