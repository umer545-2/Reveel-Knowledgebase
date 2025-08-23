import fetch from "node-fetch";

export async function handler(event, context) {
  try {
    const { query } = JSON.parse(event.body);

    // Example: Load your knowledge base (can be local or fetched)
    const knowledgeBase = await fetch(
      "https://your-site.netlify.app/knowledge.json"
    ).then((res) => res.json());

    const openAiApiKey = process.env.OPENAI_API_KEY;

    // Iterate chunks and ask GPT for match
    for (const item of knowledgeBase) {
      const prompt = `
You are a semantic search assistant.
Question: "${query}"
Compare with: "${item.text}"
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
            model: "gpt-4o-mini", // Fast and cheap
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
        return {
          statusCode: 200,
          body: JSON.stringify({
            matched_text: item.text,
            source_link: item.link,
          }),
        };
      }
    }

    // If no match found
    return {
      statusCode: 200,
      body: JSON.stringify({
        matched_text: "article-doesnt-exist",
        source_link: "",
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
}
