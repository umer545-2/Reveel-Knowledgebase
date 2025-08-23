// Use native fetch (Node.js 18+ on Netlify)
import * as cheerio from "cheerio";

const BASE_URL = "https://help.reveel.net";
const START_URL = `${BASE_URL}/support/solutions`;

function similarity(a, b) {
  a = a.toLowerCase().replace(/[^a-z0-9]/g, "");
  b = b.toLowerCase().replace(/[^a-z0-9]/g, "");
  return a.includes(b) || b.includes(a);
}

export const handler = async (event) => {
  const searchTerm = (event.queryStringParameters.q || "").toLowerCase();
  if (!searchTerm) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing query parameter ?q=" }),
    };
  }

  try {
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

    // Loop through folders and articles
    for (const folderLink of folderLinks) {
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

      for (const articleLink of articleLinks) {
        const articleRes = await fetch(articleLink);
        const articleHtml = await articleRes.text();
        const $$$ = cheerio.load(articleHtml);

        const title = $$$("h1, h2").first().text().trim();
        if (similarity(title, searchTerm)) {
          // Extract description
          const descSet = new Set();
          $$$(".fw-content--single-article p").each((i, el) => {
            const dataId = $$$(el).attr("data-identifyelement");
            const hasNoMargin = $$$(el).hasClass("no-margin");
            if (dataId !== "523" && dataId !== "520" && !hasNoMargin) {
              $$$(el)
                .find("span:not(:has(strong))")
                .each((j, span) => {
                  const text = $$$(span).text().trim();
                  if (text) descSet.add(text);
                });
            }
          });
          const description = Array.from(descSet).join(" ");

          const result = {
            link: articleLink,
            title,
            description,
          };

          return {
            statusCode: 200,
            body: JSON.stringify(result),
          };
        }
      }
    }

    return {
      statusCode: 404,
      body: JSON.stringify({ message: "No matching article found" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};