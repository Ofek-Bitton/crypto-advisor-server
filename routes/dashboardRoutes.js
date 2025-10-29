const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

/**
 * JWT authentication middleware.
 * Extracts and verifies the Bearer token,
 * and attaches the user ID to req.userId.
 */
function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.replace("Bearer ", "")
      : null;

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "devsecret"
    );

    // We expect tokens to have shape { id: <userId> }
    req.userId = decoded.id || decoded.userId;

    if (!req.userId && !req.id) {
      return res.status(401).json({ error: "Token is missing user id" });
    }

    next();
  } catch (err) {
    console.error("❌ authMiddleware error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

/**
 * Fetch current crypto prices from CoinGecko.
 * Falls back to static mock data if the API fails.
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
 * Returns the latest ~5 items.
 * Falls back to static mock data if the API fails.
 */
async function fetchNews() {
  try {
    const url =
      "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error("Bad response from CryptoCompare news");
    }

    const data = await resp.json();

    // data.Data is an array of news articles
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
          title:
            "Ethereum ecosystem sees renewed DeFi activity",
          source: "MockNews",
          url: "https://example.com/eth-defi",
        },
      ],
    };
  }
}

/**
 * Local fallback for AI insight if the LLM call fails
 * or is unavailable.
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
 * Fetch a personalized AI market insight based on user preferences.
 * Uses a public instruction-tuned model.
 * Falls back if Hugging Face inference is unavailable.
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

    // Prompt sent to the model
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

    // Public model with broad access
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

    // Hugging Face responses vary by model/provider;
    // extract the generated text in a best-effort way.
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

    // Try to locate a JSON block in the model output
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

    // Validate parsed structure
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
 * Build a meme object. Used as a fallback if meme API fails.
 */
function buildMeme() {
  return {
    caption:
      "When you said 'just one more dip' and now you're 40% down 🥲",
    imgUrl:
      "https://i.imgflip.com/your-crypto-meme-placeholder.jpg",
  };
}

/**
 * Fetch a meme from a public meme API.
 * Falls back to a known static meme if the API fails.
 */
async function getMeme() {
  try {
    const resp = await fetch("https://meme-api.com/gimme");
    const data = await resp.json();

    return {
      title: data.title,
      url: data.url, // Direct image URL suitable for <img src={url} />
      postLink: data.postLink,
      subreddit: data.subreddit,
    };
  } catch (err) {
    console.error("Meme API failed:", err);
    // Fallback meme
    return {
      title: "Fallback meme 😅",
      url: "https://i.imgflip.com/30b1gx.jpg", // “Distracted Boyfriend”
      postLink: "https://imgflip.com/i/30b1gx",
      subreddit: "memes",
    };
  }
}

/**
 * GET /dashboard
 * Returns all dashboard data in one response:
 * - user info (from DB using the ID in the token)
 * - prices
 * - news
 * - AI insight
 * - meme
 */
router.get("/", authMiddleware, async (req, res) => {
  try {
    // Load the user associated with the token
    const user = await User.findById(req.userId).lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userPrefs = user.preferences || {};

    // Fetch all dashboard sections in parallel
    const [pricesData, newsData, aiInsight, meme] = await Promise.all([
      fetchPrices(),
      fetchNews(),
      fetchAIInsight(userPrefs),
      getMeme(),
    ]);

    return res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferences: userPrefs,
      },
      prices: pricesData.prices,
      news: newsData.news,
      aiInsight,
      meme,
    });
  } catch (err) {
    console.error("❌ /dashboard error:", err.message);

    return res.status(500).json({
      error: "Failed to build dashboard",
      fallback: {
        prices: [
          { symbol: "bitcoin", usd: 65000 },
          { symbol: "ethereum", usd: 3200 },
        ],
        news: [
          {
            title:
              "Crypto market mixed as investors weigh macro factors",
            source: "Fallback",
            url: "https://example.com/fallback",
          },
        ],
        aiInsight: buildInsightFallback(),
        meme: buildMeme(),
      },
    });
  }
});

module.exports = router;
