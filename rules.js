(function installZhihuCleanRules(root) {
  "use strict";

  const ARTICLE_VOTE_THRESHOLD = 1_000;
  const ANSWER_VOTE_THRESHOLD = 10_000;

  const BLOCKED_ENTRY_ALIASES = new Map([
    ["热榜", "热榜"],
    ["专栏", "专栏"],
    ["圈子", "圈子"],
    ["aiwork", "AI Work"],
    ["aiworks", "AI Work"],
    ["aiworksbeta", "AI Work"],
    ["故事", "故事"],
    ["直答", "直答"],
    ["大家都在搜", "大家都在搜"],
    ["盐言作者平台", "盐言作者平台"]
  ]);

  const CHINESE_TOPIC_KEYWORDS = [
    // AI
    "人工智能", "生成式人工智能", "大模型", "语言模型", "机器学习", "深度学习",
    "神经网络", "计算机视觉", "自然语言处理", "多模态", "生成式", "智能体",
    "提示词", "具身智能", "自动驾驶", "机器人", "算力", "推理模型",
    "幻觉", "向量数据库", "知识图谱", "模型训练", "模型微调", "扩散模型",
    "通义千问", "文心一言", "豆包", "可灵", "智谱", "月之暗面",

    // 金融、经济与投资
    "金融", "财经", "经济", "宏观经济", "微观经济", "财政", "货币政策",
    "央行", "银行", "保险", "证券", "股票", "股市", "港股", "美股", "A股",
    "债券", "基金", "指数基金", "期货", "期权", "外汇", "汇率", "利率",
    "通胀", "通缩", "国内生产总值", "货币", "信贷", "理财", "资产配置",
    "资本市场", "财报", "估值", "融资", "风投", "私募", "并购", "房地产",
    "房价", "投资", "交易", "量化", "基本面", "技术面", "价值投资",
    "持仓", "仓位", "牛市", "熊市", "比特币", "加密货币", "数字货币",
    "区块链", "黄金", "贵金属", "大宗商品"
  ];

  const ENGLISH_TOPIC_PATTERN = /(?:\bAI\b|\bAGI\b|\bAIGC\b|\bLLM(?:s)?\b|\bGPT(?:-?\d+)?\b|\bChatGPT\b|\bOpenAI\b|\bClaude\b|\bGemini\b|\bDeepSeek\b|\bKimi\b|\bQwen\b|\bLlama\b|\bMistral\b|\bTransformer(?:s)?\b|\bRAG\b|\bAgent(?:ic|s)?\b|\bPrompt(?:ing|s)?\b|\bStable Diffusion\b|\bSora\b|\bETF(?:s)?\b|\bIPO\b|\bGDP\b|\bVC\b|\bPE\b|\bstock(?:s)?\b|\bbond(?:s)?\b|\bcrypto\b|\bbitcoin\b|\bblockchain\b|\bfintech\b)/i;

  function parseVoteCount(rawValue) {
    if (rawValue === null || rawValue === undefined) return null;

    const normalized = String(rawValue)
      .trim()
      .toLowerCase()
      .replace(/[，,\s]/g, "");

    if (!normalized) return null;

    const unitMatch = normalized.match(/(\d+(?:\.\d+)?)(万|w|千|k)/i);
    if (unitMatch) {
      const multiplier = /万|w/i.test(unitMatch[2]) ? 10_000 : 1_000;
      return Math.round(Number(unitMatch[1]) * multiplier);
    }

    const plainMatch = normalized.match(/\d+/);
    return plainMatch ? Number(plainMatch[0]) : null;
  }

  function normalizeEntryText(rawText) {
    return String(rawText || "")
      .replace(/[\s\u200b-\u200d\ufeff]+/g, "")
      .toLowerCase();
  }

  function classifyBlockedEntry({ text, href } = {}) {
    const textMatch = BLOCKED_ENTRY_ALIASES.get(normalizeEntryText(text));
    if (textMatch) return textMatch;

    if (!href) return null;

    let url;
    try {
      url = new URL(String(href), "https://www.zhihu.com/");
    } catch {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.replace(/\/+$/, "") || "/";

    if (hostname === "zhida.zhihu.com") return "直答";
    if (hostname === "salt.zhihu.com") return "盐言作者平台";

    if (hostname !== "www.zhihu.com") return null;
    if (pathname === "/hot") return "热榜";
    if (pathname === "/column-square") return "专栏";
    if (
      pathname === "/ring-feeds" ||
      pathname === "/circle" ||
      pathname.startsWith("/circle/")
    ) return "圈子";
    if (pathname === "/project-square") return "AI Work";
    if (pathname === "/fiore/h5/vip-web") return "故事";

    return null;
  }

  function isRelevantText(rawText) {
    const text = String(rawText || "");
    if (!text) return false;
    return CHINESE_TOPIC_KEYWORDS.some((keyword) => text.includes(keyword)) ||
      ENGLISH_TOPIC_PATTERN.test(text);
  }

  function classifyFacts(facts) {
    if (facts.explicitAd) return "explicit-ad";

    if (
      facts.type === "article" &&
      Number.isFinite(facts.votes) &&
      facts.votes >= ARTICLE_VOTE_THRESHOLD &&
      !facts.relevant &&
      !facts.hasFollowedEndorsement
    ) {
      return "high-vote-article-without-followed-like";
    }

    if (
      facts.type === "answer" &&
      Number.isFinite(facts.votes) &&
      facts.votes < ANSWER_VOTE_THRESHOLD &&
      !facts.relevant
    ) {
      return "low-vote-unrelated-answer";
    }

    return null;
  }

  root.ZhihuCleanRules = Object.freeze({
    ARTICLE_VOTE_THRESHOLD,
    ANSWER_VOTE_THRESHOLD,
    classifyBlockedEntry,
    classifyFacts,
    isRelevantText,
    parseVoteCount
  });
})(globalThis);
