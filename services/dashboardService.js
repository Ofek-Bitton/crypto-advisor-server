// server/services/dashboardService.js

// Node 18+ already has global fetch, so we don't need node-fetch here.

/**
 * Build fallback AI insight if the model call fails.
 */
function buildInsightFallback() {
  return {
    text:
      "Short-term momentum is cooling, but long-term accumulation remains healthy. Avoid emotional trades — stick to your plan.",
    sentiment: "cautious-bullish",
    fromModel: false,
  };
}

/**
 * Fetch crypto prices from CoinGecko.
 * Falls back to static mock data on failure.
 */
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

/**
 * Fetch recent crypto news headlines from CryptoCompare.
 * Returns ~5 items. Falls back to static news on failure.
 */
async function fetchNews() {
  try {
    const url = "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error("Bad response from CryptoCompare news");
    }

    const data = await resp.json();

    const top5 = (data.Data || []).slice(0, 5).map((item) => ({
      title: item.title,
      source: item.source,
      url: item.url,
    }));

    return {
      success: true,
      news: top5,
    };
  } catch (err) {
    console.warn("⚠ fetchNews failed, using fallback mock:", err.message);

    return {
      success: false,
      news: [
        {
          title:
            "Bitcoin holds steady as investors await Fed comments",
          source: "MockNews",
          url: "https://example.com/bitcoin-steady",
        },
        {
          title: "Ethereum ecosystem sees renewed DeFi activity",
          source: "MockNews",
          url: "https://example.com/eth-defi",
        },
      ],
    };
  }
}

/**
 * Call HF model for AI insight (personalized),
 * with fallback if no HF_API_KEY or if call fails.
 */
async function fetchAIInsight(userPrefs) {
  if (!process.env.HF_API_KEY) {
    console.warn("⚠ No HF_API_KEY provided. Using fallback insight.");
    return buildInsightFallback();
  }

  try {
    const assets =
      (userPrefs?.cryptoAssets || []).join(", ") || "crypto assets";
    const riskProfile =
      userPrefs?.investorType || "general retail investor";

    const promptText = `
You are a crypto investment assistant.
User is mainly interested in: ${assets}.
User profile: ${riskProfile}.

Give one actionable crypto market insight for TODAY ONLY.
Keep it under 80 words.
Then provide a sentiment tag: bullish / bearish / neutral.

Return STRICT valid JSON only:
{
  "text": "...",
  "sentiment": "..."
}
`;

    const HF_MODEL =
      process.env.HF_MODEL_NAME || "tiiuae/falcon-7b-instruct";

    console.log("🔎 Calling HF model:", HF_MODEL);

    const resp = await fetch(
      `https://router.huggingface.co/hf-inference/models/${HF_MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: promptText,
        }),
      }
    );

    if (!resp.ok) {
      console.warn(
        "⚠ HF response not ok:",
        resp.status,
        resp.statusText
      );
      return buildInsightFallback();
    }

    const hfData = await resp.json();
    console.log("🔎 Raw HF data:", JSON.stringify(hfData).slice(0, 500));

    let rawText = "";

    if (Array.isArray(hfData) && hfData.length > 0) {
      rawText =
        hfData[0].generated_text ||
        hfData[0].text ||
        JSON.stringify(hfData[0]);
    } else if (typeof hfData === "object" && hfData !== null) {
      rawText =
        hfData.generated_text ||
        hfData.text ||
        JSON.stringify(hfData);
    } else {
      rawText = String(hfData);
    }

    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn(
        "⚠ HF: no JSON block found. rawText begins with:",
        rawText.slice(0, 200)
      );
      return buildInsightFallback();
    }

    let parsed;
    try {
      parsed = JSON.parse(match[0]);
    } catch (err) {
      console.warn("⚠ HF JSON parse error:", err.message);
      return buildInsightFallback();
    }

    if (
      !parsed.text ||
      typeof parsed.text !== "string" ||
      !parsed.sentiment ||
      typeof parsed.sentiment !== "string"
    ) {
      console.warn("⚠ HF JSON missing fields:", parsed);
      return buildInsightFallback();
    }

    return {
      text: parsed.text.trim(),
      sentiment: parsed.sentiment.trim().toLowerCase(),
      fromModel: true,
    };
  } catch (err) {
    console.warn("⚠ fetchAIInsight failed, using fallback:", err.message);
    return buildInsightFallback();
  }
}

/**
 * Fallback meme (if API fails).
 */
function buildMeme() {
  return {
    title: "Fallback meme 😅",
    url: "https://i.imgflip.com/30b1gx.jpg",
    postLink: "https://imgflip.com/i/30b1gx",
    subreddit: "memes",
  };
}

/**
 * Fetch meme from meme-api.com, fallback if needed.
 */
async function fetchMeme() {
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
    return buildMeme();
  }
}

/**
 * This is the main service function: build all dashboard data for a given user.
 * It matches exactly what the frontend expects.
 */
async function getDashboardDataForUser(userDoc) {
  // userDoc is a Mongo user document (or lean user)
  const userPrefs = userDoc.preferences || {};

  const [pricesData, newsData, aiInsight, meme] = await Promise.all([
    fetchPrices(),
    fetchNews(),
    fetchAIInsight(userPrefs),
    fetchMeme(),
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
