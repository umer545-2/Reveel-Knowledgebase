import * as cheerio from "cheerio";
import { writeFileSync } from "fs";
import path from "path";

const BASE_URL = "https://help.reveel.net";
const START_URL = `${BASE_URL}/support/solutions`;

async function main() {
  const response = await fetch(START_URL);
  const html = await response.text();
  const $ = cheerio.load(html);

  const folderLinks = [];
  $("a[href*='/support/solutions/folders/']").each((i, el) => {
    const href = $(el).attr("href");
    if (href && !folderLinks.includes(href)) {
      folderLinks.push(href.startsWith("http") ? href : BASE_URL + href);
    }
  });

  const folderPages = await Promise.all(
    folderLinks.map(async (folderLink) => {
      const res = await fetch(folderLink);
      return await res.text();
    })
  );

  const articles = [];
  folderPages.forEach((pageHtml) => {
    const $$ = cheerio.load(pageHtml);
    $$("a[href^='/support/solutions/articles/']").each((i, el) => {
      const href = $$(el).attr("href");
      const fullLink = href.startsWith("http") ? href : BASE_URL + href;
      const title = $$(el).find(".line-clamp-2").text().trim();
      if (href && title) {
        articles.push({ link: fullLink, title });
      }
    });
  });

  const articlesPath = path.join(process.cwd(), "articles.json");
  writeFileSync(articlesPath, JSON.stringify(articles, null, 2), "utf-8");
  console.log(`Saved ${articles.length} articles to articles.json`);
}

main();