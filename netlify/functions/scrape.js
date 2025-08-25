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

    const selectedIndex = parseInt(selectionText.match(/\d+/)?.[0], 10) - 1;
    const match = articles[selectedIndex];

    if (!match || !match.link) {
      const relevancePrompt = `
You are a knowledge base assistant for Reveel. 
If the following question is NOT related to Reveel or its articles, reply ONLY with "irrelevant".
If it IS related, reply ONLY with "relevant" if it is relevant and there is no articles on it reply with article-doesnt-exist.
If the question includes bad words reply with "Sorry, i cannot answer that"


Question: "${query}"
`;

      const relevanceResponse = await fetch(
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
              { role: "user", content: relevancePrompt },
            ],
            temperature: 0,
          }),
        }
      );

      const relevanceResult = await relevanceResponse.json();
      const relevance =
        relevanceResult.choices &&
        relevanceResult.choices[0] &&
        relevanceResult.choices[0].message &&
        relevanceResult.choices[0].message.content
          ? relevanceResult.choices[0].message.content.trim().toLowerCase()
          : "";

      if (relevance === "irrelevant") {
        return {
          statusCode: 200,
          body: JSON.stringify(
            "Sorry, I can only answer questions related to Reveel."
          ),
        };
      } else {
        return {
          statusCode: 200,
          body: JSON.stringify(
            "No relevant article found in the knowledge base."
          ),
        };
      }
    }

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
If there is no relevant content in the article to answer the question, reply ONLY with: article-doesnt-exist.

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

    if (answer === "article-doesnt-exist") {
      return {
        statusCode: 200,
        body: JSON.stringify("article-doesnt-exist"),
      };
    }

    const formattedAnswer = answer.replace(/[\n\r]+/g, " ").replace(/"/g, "");
    return {
      statusCode: 200,
      body: JSON.stringify(`${formattedAnswer} Source: ${match.link}`),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
