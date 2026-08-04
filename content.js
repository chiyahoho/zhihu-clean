(function startZhihuClean() {
  "use strict";

  const rules = globalThis.ZhihuCleanRules;
  if (!rules) return;

  const HIDDEN_CARD_CLASS = "zhihu-clean-hidden-card";
  const HIDDEN_ENTRY_CLASS = "zhihu-clean-hidden-entry";
  const CARD_SELECTOR = [
    ".TopstoryItem",
    '[data-za-detail-view-path-module="FeedItem"]',
    '[data-za-module="FeedItem"]'
  ].join(",");
  const CONTENT_SELECTOR = ".AnswerItem, .ArticleItem, .ContentItem";
  const UI_SCOPE_SELECTOR = [
    "header",
    "nav",
    "aside",
    '[role="navigation"]',
    ".AppHeader",
    ".GlobalSideBar",
    ".TopstoryPageHeader",
    ".TopstoryTabs",
    ".SearchSideBar",
    '[class*="Sidebar"]',
    '[class*="SideBar"]',
    '[class*="sideBar"]'
  ].join(",");
  const INTERACTIVE_ENTRY_SELECTOR = [
    "a[href]",
    "button",
    '[role="link"]',
    '[role="menuitem"]',
    '[role="tab"]'
  ].join(",");
  const ENTRY_ITEM_SELECTOR = [
    "li",
    '[role="listitem"]',
    ".AppHeader-navItem",
    ".Tabs-item",
    '[class*="MenuItem"]',
    '[class*="Menu-item"]',
    '[class*="NavItem"]',
    '[class*="navItem"]'
  ].join(",");
  const pendingCards = new Set();
  let flushScheduled = false;
  let uiCleanupScheduled = false;
  let lastUrl = location.href;

  function hideEntryTarget(target, reason) {
    if (!target) return;
    target.classList.add(HIDDEN_ENTRY_CLASS);
    target.dataset.zhihuCleanEntry = reason;
  }

  function findEntryItem(entry, scope) {
    const item = entry.closest(ENTRY_ITEM_SELECTOR);
    return item && scope.contains(item) ? item : entry;
  }

  function findFeatureGroup(label, reason, boundary) {
    let candidate = label;
    let fallback = null;
    let depth = 0;

    // 限制向上查找层数，避免正文中偶然出现同名文本时一路匹配到整个页面。
    while (candidate && candidate !== boundary && depth < 8) {
      if (
        reason === "大家都在搜" &&
        candidate.querySelector('a[href*="search_source=Trending"]')
      ) {
        return candidate;
      }

      if (
        reason === "盐言作者平台" &&
        /去投稿/.test(candidate.textContent || "")
      ) {
        return candidate;
      }

      if (
        reason === "盐言作者平台" &&
        !fallback &&
        /写好故事/.test(candidate.textContent || "")
      ) {
        fallback = candidate;
      }

      candidate = candidate.parentElement;
      depth += 1;
    }

    return fallback || label;
  }

  function hideTextOnlyFeatures() {
    const boundary = document.querySelector("main") || document.body;
    if (!boundary) return;

    const walker = document.createTreeWalker(boundary, NodeFilter.SHOW_TEXT);
    const labels = new Map();
    let textNode = walker.nextNode();

    while (textNode) {
      const reason = rules.classifyBlockedEntry({ text: textNode.nodeValue });
      if (reason !== "大家都在搜" && reason !== "盐言作者平台") {
        textNode = walker.nextNode();
        continue;
      }

      if (textNode.parentElement) labels.set(textNode.parentElement, reason);
      textNode = walker.nextNode();
    }

    for (const [label, reason] of labels) {
      hideEntryTarget(findFeatureGroup(label, reason, boundary), reason);
    }
  }

  function hideBlockedEntries() {
    uiCleanupScheduled = false;

    const allScopes = Array.from(document.querySelectorAll(UI_SCOPE_SELECTOR));
    const scopes = allScopes.filter((scope) =>
      !allScopes.some((parent) => parent !== scope && parent.contains(scope))
    );

    for (const scope of scopes) {
      const entries = scope.matches(INTERACTIVE_ENTRY_SELECTOR)
        ? [scope, ...scope.querySelectorAll(INTERACTIVE_ENTRY_SELECTOR)]
        : scope.querySelectorAll(INTERACTIVE_ENTRY_SELECTOR);

      for (const entry of entries) {
        const reason = rules.classifyBlockedEntry({
          text: entry.textContent,
          href: entry.getAttribute("href")
        });
        if (!reason) continue;

        if (reason === "大家都在搜") {
          const section = entry.closest(".Card, section, [role=region]");
          hideEntryTarget(section && scope.contains(section) ? section : entry, reason);
        } else {
          hideEntryTarget(findEntryItem(entry, scope), reason);
        }
      }

    }

    // 新版知乎右栏使用动态类名，这两个模块不依赖任何固定侧栏选择器。
    hideTextOnlyFeatures();
  }

  function queueUiCleanup() {
    if (uiCleanupScheduled) return;
    uiCleanupScheduled = true;
    requestAnimationFrame(hideBlockedEntries);
  }

  function isRecommendationPage() {
    return location.protocol === "https:" &&
      location.hostname === "www.zhihu.com" &&
      location.pathname === "/";
  }

  function findCard(node) {
    if (!(node instanceof Element)) return null;

    if (node.matches(CARD_SELECTOR)) return node;

    const directCard = node.closest(CARD_SELECTOR);
    if (directCard) return directCard;

    const contentItem = node.matches(CONTENT_SELECTOR)
      ? node
      : node.closest(CONTENT_SELECTOR) || node.querySelector(CONTENT_SELECTOR);

    // .Card 只是旧版/改版的兜底；只有先确认存在回答或文章内容时才使用，
    // 避免把右栏或整个信息流容器误当成一张推荐卡片。
    return contentItem ? contentItem.closest(".Card") : null;
  }

  function detectType(card) {
    if (card.querySelector(".AnswerItem")) return "answer";
    if (card.querySelector(".ArticleItem")) return "article";

    if (card.querySelector('a[href*="/question/"][href*="/answer/"]')) {
      return "answer";
    }

    if (card.querySelector('a[href^="https://zhuanlan.zhihu.com/p/"], a[href^="/p/"]')) {
      return "article";
    }

    return "unknown";
  }

  function getVoteCount(card) {
    const candidates = card.querySelectorAll([
      "button.VoteButton--up",
      'button[class*="VoteButton--up"]',
      'button[aria-label*="赞同"]',
      '.ContentItem-actions button'
    ].join(","));

    for (const button of candidates) {
      const className = String(button.className || "");
      const values = [
        button.getAttribute("aria-label"),
        button.getAttribute("title"),
        button.textContent
      ];

      const looksLikeUpvote = className.includes("VoteButton--up") ||
        values.some((value) => /赞同/.test(value || ""));
      const looksLikeDownvote = values.some((value) => /反对/.test(value || ""));
      if (!looksLikeUpvote || looksLikeDownvote) continue;

      for (const value of values) {
        const count = rules.parseVoteCount(value);
        if (count !== null) return count;
      }
    }

    return null;
  }

  function getRelevantText(card) {
    const selectors = [
      "h2",
      ".ContentItem-title",
      ".RichContent-inner",
      ".RichContent-collapsedText",
      '[itemprop="text"]',
      ".Tag-content"
    ].join(",");

    return Array.from(card.querySelectorAll(selectors))
      .slice(0, 12)
      .map((element) => element.textContent || "")
      .join("\n");
  }

  function hasFollowedEndorsement(card) {
    const sourceText = Array.from(card.querySelectorAll([
      ".FeedSource",
      '[class*="FeedSource"]',
      '[class*="feedSource"]',
      '[data-za-detail-view-path-module*="FeedSource"]'
    ].join(",")))
      .slice(0, 8)
      .map((element) => element.textContent || element.getAttribute("aria-label") || "")
      .join(" ");

    return /关注的人|关注的.{0,20}(?:赞同|推荐)|(?:赞同|推荐)了(?:该|这)?(?:回答|文章)?/.test(sourceText);
  }

  function isExplicitAd(card) {
    if (card.matches('[data-ad], [data-is-ad="true"], [data-type="ad"]')) {
      return true;
    }

    if (card.querySelector([
      '[data-ad]',
      '[data-is-ad="true"]',
      ".Pc-card",
      ".Pc-feedAd-container",
      ".FeedAd",
      '[class*="Advertisement"]',
      '[class*="AdvertCard"]'
    ].join(","))) {
      return true;
    }

    // 知乎会改广告类名，因此保留一个只匹配叶子标签精确文案的兜底。
    return Array.from(card.querySelectorAll("span, a, button"))
      .slice(0, 80)
      .some((element) =>
        element.children.length === 0 && /^(广告|推广)$/.test((element.textContent || "").trim())
      );
  }

  function inspectCard(card) {
    const type = detectType(card);
    const votes = getVoteCount(card);
    const relevant = (type === "answer" || type === "article") &&
      rules.isRelevantText(getRelevantText(card));
    const reason = rules.classifyFacts({
      explicitAd: isExplicitAd(card),
      type,
      votes,
      relevant,
      hasFollowedEndorsement: hasFollowedEndorsement(card)
    });

    card.classList.toggle(HIDDEN_CARD_CLASS, Boolean(reason));

    if (reason) {
      card.dataset.zhihuCleanReason = reason;
    } else {
      delete card.dataset.zhihuCleanReason;
    }
  }

  function flushCards() {
    flushScheduled = false;
    if (!isRecommendationPage()) {
      pendingCards.clear();
      return;
    }

    for (const card of pendingCards) {
      if (card.isConnected) inspectCard(card);
    }
    pendingCards.clear();
  }

  function queueCard(card) {
    if (!card) return;
    pendingCards.add(card);

    if (!flushScheduled) {
      flushScheduled = true;
      requestAnimationFrame(flushCards);
    }
  }

  function queueFromNode(node) {
    const element = node instanceof Element ? node : node.parentElement;
    if (!element) return;

    queueCard(findCard(element));
    for (const candidate of element.querySelectorAll(`${CARD_SELECTOR}, ${CONTENT_SELECTOR}`)) {
      queueCard(findCard(candidate));
    }
  }

  function scanAllCards() {
    if (!isRecommendationPage()) return;
    for (const candidate of document.querySelectorAll(`${CARD_SELECTOR}, ${CONTENT_SELECTOR}`)) {
      queueCard(findCard(candidate));
    }
  }

  function restoreAllCards() {
    pendingCards.clear();
    for (const card of document.querySelectorAll(`.${HIDDEN_CARD_CLASS}`)) {
      card.classList.remove(HIDDEN_CARD_CLASS);
      delete card.dataset.zhihuCleanReason;
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (isRecommendationPage()) scanAllCards();
      else restoreAllCards();
    }

    queueUiCleanup();

    if (!isRecommendationPage()) return;

    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        queueFromNode(mutation.target);
      } else {
        for (const addedNode of mutation.addedNodes) queueFromNode(addedNode);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });

  // 知乎是单页应用。轮询只检查 URL，用于覆盖没有 DOM 变动的 history 跳转。
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (isRecommendationPage()) scanAllCards();
    else restoreAllCards();
  }, 750);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scanAllCards();
      queueUiCleanup();
    }, { once: true });
  } else {
    scanAllCards();
    queueUiCleanup();
  }
})();
