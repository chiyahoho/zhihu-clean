const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "rules.js"), "utf8");
const context = vm.createContext({ URL });
vm.runInContext(source, context);
const rules = context.ZhihuCleanRules;

test("recognizes blocked navigation labels without matching surrounding content", () => {
  const labels = [
    "热榜",
    "专栏",
    "圈子",
    "AIwork",
    "AI Works Beta",
    "故事",
    "直答",
    "大家都在搜",
    "盐言作者平台"
  ];

  for (const label of labels) {
    assert.ok(rules.classifyBlockedEntry({ text: label }), label);
  }

  assert.equal(rules.classifyBlockedEntry({ text: "讲一个故事" }), null);
  assert.equal(rules.classifyBlockedEntry({ text: "热门专栏文章" }), null);
});

test("recognizes the current Zhihu URLs for blocked entries", () => {
  const cases = [
    ["https://www.zhihu.com/hot", "热榜"],
    ["/column-square", "专栏"],
    ["/ring-feeds", "圈子"],
    ["/project-square", "AI Work"],
    ["/fiore/h5/vip-web", "故事"],
    ["https://zhida.zhihu.com/", "直答"],
    ["https://salt.zhihu.com/", "盐言作者平台"]
  ];

  for (const [href, expected] of cases) {
    assert.equal(rules.classifyBlockedEntry({ href }), expected, href);
  }

  assert.equal(rules.classifyBlockedEntry({
    href: "https://zhuanlan.zhihu.com/p/123"
  }), null);
  assert.equal(rules.classifyBlockedEntry({
    href: "https://www.zhihu.com/project/detail/123"
  }), null);
});

test("parses Zhihu vote count formats", () => {
  assert.equal(rules.parseVoteCount("赞同 1.2 万"), 12_000);
  assert.equal(rules.parseVoteCount("5,001 人赞同"), 5_001);
  assert.equal(rules.parseVoteCount("4.9k"), 4_900);
  assert.equal(rules.parseVoteCount("赞同"), null);
});

test("hides explicit ads", () => {
  assert.equal(rules.classifyFacts({ explicitAd: true }), "explicit-ad");
});

test("only hides unrelated articles with at least 1,000 votes and no followed endorsement", () => {
  assert.equal(rules.classifyFacts({
    explicitAd: false,
    type: "article",
    votes: 1_000,
    relevant: false,
    hasFollowedEndorsement: false
  }), "high-vote-article-without-followed-like");

  assert.equal(rules.classifyFacts({
    explicitAd: false,
    type: "article",
    votes: 20_000,
    relevant: false,
    hasFollowedEndorsement: true
  }), null);

  assert.equal(rules.classifyFacts({
    explicitAd: false,
    type: "article",
    votes: 20_000,
    relevant: true,
    hasFollowedEndorsement: false
  }), null);

  assert.equal(rules.classifyFacts({
    explicitAd: false,
    type: "article",
    votes: 999,
    relevant: false,
    hasFollowedEndorsement: false
  }), null);
});

test("only hides low-vote answers when they are unrelated", () => {
  assert.equal(rules.classifyFacts({
    explicitAd: false,
    type: "answer",
    votes: 9_999,
    relevant: false
  }), "low-vote-unrelated-answer");

  assert.equal(rules.classifyFacts({
    explicitAd: false,
    type: "answer",
    votes: 9_999,
    relevant: true
  }), null);

  assert.equal(rules.classifyFacts({
    explicitAd: false,
    type: "answer",
    votes: 10_000,
    relevant: false
  }), null);
});

test("recognizes AI, finance, and investment topics", () => {
  assert.equal(rules.isRelevantText("大模型的推理成本会继续下降吗？"), true);
  assert.equal(rules.isRelevantText("How does RAG improve an LLM?"), true);
  assert.equal(rules.isRelevantText("利率变化对债券估值的影响"), true);
  assert.equal(rules.isRelevantText("今天晚饭做什么？"), false);
});
