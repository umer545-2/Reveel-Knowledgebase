// Use native fetch (Node.js 18+ on Netlify)
import * as cheerio from "cheerio";

const BASE_URL = "https://help.reveel.net";
const START_URL = `${BASE_URL}/support/solutions`;

export const handler = async (event) => {
  try {
    // Get query from query params (?query=...)
    const query = event.queryStringParameters?.query;
    if (!query) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing query parameter." }),
      };
    }

    // Fetch main solutions page
    const response = await fetch(START_URL);
    const html = await response.text();
    const $ = cheerio.load(html);

    // Get folder links
    const folderLinks = [];
    $("a[href*='/support/solutions/folders/']").each((i, el) => {
      const href = $(el).attr("href");
      if (href && !folderLinks.includes(href)) {
        folderLinks.push(href.startsWith("http") ? href : BASE_URL + href);
      }
    });

    // Collect all articles in parallel
    let match = null;
    const folderFetches = folderLinks.map(async (folderLink) => {
      if (match) return; // Early exit if match found

      const res = await fetch(folderLink);
      const pageHtml = await res.text();
      const $$ = cheerio.load(pageHtml);

      const articleLinks = [];
      $$("a[href^='/support/solutions/articles/']").each((i, el) => {
        const href = $$(el).attr("href");
        if (href && !articleLinks.includes(href)) {
          articleLinks.push(href.startsWith("http") ? href : BASE_URL + href);
        }
      });

      // Fetch articles in parallel
      for (const articleLink of articleLinks) {
        if (match) break; // Early exit if match found

        const articleRes = await fetch(articleLink);
        const articleHtml = await articleRes.text();
        const $$$ = cheerio.load(articleHtml);

        const title = $$$("h1, h2").first().text().trim();

        // Use OpenAI to check for semantic match
        const openAiApiKey = process.env.OPENAI_API_KEY;
        const prompt = `
You are a semantic search assistant.
Question: "${query}"
Compare with: "${title}"
Is this a match (at least 85% similar)? Reply with ONLY "YES" or "NO".
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
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: "You are a strict semantic similarity checker.",
                },
                { role: "user", content: prompt },
              ],
              temperature: 0,
            }),
          }
        );

        const result = await gptResponse.json();
        const answer = result.choices[0].message.content.trim();

        if (answer.toUpperCase() === "YES") {
          match = {
            matched_title: title,
            source_link: articleLink,
          };
          break;
        }
      }
    });

    await Promise.all(folderFetches);

    if (match) {
      return {
        statusCode: 200,
        body: JSON.stringify(match),
      };
    }

    // If no match found
    return {
      statusCode: 200,
      body: JSON.stringify({
        matched_title: "article-doesnt-exist",
        source_link: "",
      }),
    };;
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};