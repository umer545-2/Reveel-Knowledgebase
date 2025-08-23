// Use native fetch (Node.js 18+ on Netlify)
import * as cheerio from "cheerio";

const BASE_URL = "https://help.reveel.net";
const START_URL = `${BASE_URL}/support/solutions`;

export const handler = async (event) => {
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

    // Collect all articles
    const articles = [];

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

        articles.push({
          link: articleLink,
          title,
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ articles }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};