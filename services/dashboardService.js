// server/services/dashboardService.js

// fallback if AI / network fails
function buildInsightFallback() {
  return {
    text:
      "Short-term momentum is cooling, but long-term accumulation remains healthy. Avoid emotional trades — stick to your plan.",
    sentiment: "cautious-bullish",
    fromModel: false,
  };
}

// -------------------- PRICES --------------------
async function fetchPrices() {
  try {
    const url =
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,dogecoin&vs_currencies=usd";

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error("Bad response from CoinGecko");
    }

    const data = await resp.json();

    return {
      success: true,
      prices: Object.entries(data).map(([symbol, obj]) => ({
        symbol,
        usd: obj.usd,
      })),
    };
  } catch (err) {
    console.warn("⚠ fetchPrices failed, using fallback mock:", err.message);

    return {
      success: false,
      prices: [
        { symbol: "bitcoin", usd: 65000 },
        { symbol: "ethereum", usd: 3200 },
        { symbol: "solana", usd: 150 },
        { symbol: "dogecoin", usd: 0.12 },
      ],
    };
  }
}

// -------------------- NEWS (filtered by user assets) --------------------

// helper: does this headline mention at least one of the user's chosen assets?
function matchesAssets(title, assets) {
  if (!assets || assets.length === 0) return true; // no prefs? show everything

  const lower = title.toLowerCase();
  for (const asset of assets) {
    if (
      asset === "BTC" &&
      (lower.includes("btc") || lower.includes("bitcoin"))
    ) {
      return true;
    }
    if (
      asset === "ETH" &&
      (lower.includes("eth") || lower.includes("ethereum"))
    ) {
      return true;
    }
    if (
      asset === "SOL" &&
      (lower.includes("sol") || lower.includes("solana"))
    ) {
      return true;
    }
    if (
      asset === "DOGE" &&
      (lower.includes("doge") || lower.includes("dogecoin"))
    ) {
      return true;
    }
  }
  return false;
}

async function fetchNewsFiltered(userPrefs) {
  let base;
  try {
    const url = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Bad response from CryptoCompare news");
    const data = await resp.json();

    base = (data.Data || []).map((item) => ({
      title: item.title,
      source: item.source,
      url: item.url,
    }));
  } catch (err) {
    console.warn("⚠ fetchNewsFiltered fallback:", err.message);
    base = [
      {
        title:
          "Bitcoin holds steady as investors await Fed comments",
        source: "MockNews",
        url: "https://example.com/bitcoin-steady",
      },
      {
        title:
          "Ethereum ecosystem sees renewed DeFi activity",
        source: "MockNews",
        url: "https://example.com/eth-defi",
      },
    ];
  }

  const assets = userPrefs?.cryptoAssets || [];
  const filtered = base.filter((article) =>
    matchesAssets(article.title, assets)
  );

  const finalList =
    filtered.length > 0 ? filtered.slice(0, 5) : base.slice(0, 5);

  return {
    success: true,
    news: finalList,
  };
}

// -------------------- AI INSIGHT (OpenRouter) --------------------
async function fetchAIInsight(userPrefs) {
  if (!process.env.OPENROUTER_API_KEY) {
    return buildInsightFallback();
  }

  try {
    const assetsList = userPrefs?.cryptoAssets || [];
    const assets =
      assetsList.length > 0
        ? assetsList.join(", ")
        : "crypto assets";

    const riskProfile =
      userPrefs?.investorType || "a normal retail investor";

    // updated prompt: force the model to only talk about chosen assets
    const promptText = `
You are a crypto investment assistant.

User is ONLY interested in these assets: ${assets}.
User's risk profile: ${riskProfile}.

Task:
1. Give ONE actionable, short-term market insight for ONLY those assets above (ignore all other coins).
2. Max 80 words.
3. Add a sentiment tag: bullish / bearish / neutral (for those assets only).

Return STRICT JSON ONLY in this format:
{
  "text": "...",
  "sentiment": "..."
}

Rules:
- Do NOT mention assets the user did not list.
- Do NOT talk about general crypto market, only the user's coins.
- Do NOT add explanations.
- Do NOT add markdown.
- Do NOT wrap the JSON in \`\`\` fences.
- Output only raw JSON.
`;

    const modelName =
      process.env.OPENROUTER_MODEL || "mistralai/mistral-7b-instruct";

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          {
            role: "system",
            content:
              "You are a concise crypto market analyst. You MUST respond in valid JSON only. No markdown fences like ```.",
          },
          {
            role: "user",
            content: promptText,
          },
        ],
        temperature: 0.7,
        max_tokens: 200,
      }),
    });

    if (!resp.ok) {
      console.warn(
        "[AI] OpenRouter response not ok:",
        resp.status,
        resp.statusText
      );
      return buildInsightFallback();
    }

    const data = await resp.json();

    let aiMessage = data?.choices?.[0]?.message?.content || "";

    aiMessage = aiMessage.trim();
    if (aiMessage.startsWith("```")) {
      aiMessage = aiMessage.replace(/^```[a-zA-Z]*\s*/, "");
      aiMessage = aiMessage.replace(/```$/, "").trim();
    }

    let parsed;
    try {
      parsed = JSON.parse(aiMessage);
    } catch (err) {
      console.warn(
        "[AI] Failed to parse OpenRouter JSON after cleanup:",
        err.message
      );
      return buildInsightFallback();
    }

    if (
      !parsed.text ||
      typeof parsed.text !== "string" ||
      !parsed.sentiment ||
      typeof parsed.sentiment !== "string"
    ) {
      console.warn("[AI] OpenRouter JSON missing fields:", parsed);
      return buildInsightFallback();
    }

    return {
      text: parsed.text.trim(),
      sentiment: parsed.sentiment.trim().toLowerCase(),
      fromModel: true,
    };
  } catch (err) {
    console.warn("[AI] fetchAIInsight via OpenRouter failed:", err.message);
    return buildInsightFallback();
  }
}

// -------------------- MEME --------------------
function buildMeme() {
  return {
    caption:
      "When you said 'just one more dip' and now you're 40% down 🥲",
    imgUrl: "https://i.imgflip.com/your-crypto-meme-placeholder.jpg",
  };
}

async function getMeme() {
  try {
    const resp = await fetch("https://meme-api.com/gimme");
    const data = await resp.json();

    return {
      title: data.title,
      url: data.url,
      postLink: data.postLink,
      subreddit: data.subreddit,
    };
  } catch (err) {
    console.error("Meme API failed:", err);

    return {
      title: "Fallback meme 😅",
      url: "https://i.imgflip.com/30b1gx.jpg",
      postLink: "https://imgflip.com/i/30b1gx",
      subreddit: "memes",
    };
  }
}

// -------------------- MAIN ASSEMBLER --------------------
async function getDashboardDataForUser(userDoc) {
  const userPrefs = userDoc.preferences || {};

  const [pricesData, newsData, aiInsight, meme] = await Promise.all([
    fetchPrices(),
    fetchNewsFiltered(userPrefs), // <-- now filtered by user assets
    fetchAIInsight(userPrefs),    // <-- now AI only talks about chosen assets
    getMeme(),
  ]);

  return {
    user: {
      id: userDoc._id,
      name: userDoc.name,
      email: userDoc.email,
      preferences: userPrefs,
    },
    prices: pricesData.prices,
    news: newsData.news,
    aiInsight,
    meme,
  };
}

module.exports = {
  getDashboardDataForUser,
};
