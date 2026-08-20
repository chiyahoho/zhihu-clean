const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rulesSource = fs.readFileSync(path.join(__dirname, "..", "rules.js"), "utf8");
const contentSource = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");
const HIDDEN_CARD_CLASS = "zhihu-clean-hidden-card";

function splitSelectors(selector) {
  return String(selector).split(",").map((part) => part.trim()).filter(Boolean);
}

class FakeClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }

  toggle(value, force) {
    if (force === undefined) {
      force = !this.values.has(value);
    }

    if (force) this.values.add(value);
    else this.values.delete(value);
    return force;
  }
}

class FakeElement {
  constructor(tagName, selectors = [], { text = "", attributes = {} } = {}) {
    this.tagName = tagName.toLowerCase();
    this.selectorMatches = new Set(selectors);
    this.classList = new FakeClassList(
      selectors.filter((selector) => /^\.[\w-]+$/.test(selector))
        .map((selector) => selector.slice(1))
    );
    this.className = Array.from(this.classList.values).join(" ");
    this.textContent = text;
    this.attributes = attributes;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.isConnected = true;
  }

  append(...children) {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
    return this;
  }

  matches(selector) {
    return splitSelectors(selector).some((part) =>
      part === this.tagName ||
      this.selectorMatches.has(part) ||
      (part.startsWith(".") && this.classList.contains(part.slice(1)))
    );
  }

  closest(selector) {
    for (let candidate = this; candidate; candidate = candidate.parentElement) {
      if (candidate.matches(selector)) return candidate;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (element) => {
      for (const child of element.children) {
        if (child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  contains(element) {
    return element === this || this.children.some((child) => child.contains(element));
  }
}

function createAnswerCard(relevantText) {
  const root = new FakeElement("html");
  const outer = new FakeElement("div", [".TopstoryItem"]);
  const inner = new FakeElement("div", ['[data-za-module="FeedItem"]']);
  const answer = new FakeElement("article", [".AnswerItem"]);
  const title = new FakeElement("h2", ["h2"], { text: relevantText });
  const vote = new FakeElement("button", ["button.VoteButton--up"], {
    text: "赞同 100",
    attributes: { "aria-label": "赞同 100" }
  });

  answer.append(title, vote);
  inner.append(answer);
  outer.append(inner);
  root.append(outer);
  return { root, outer, inner, title };
}

function runContentScript(root) {
  const observers = [];
  const document = {
    documentElement: root,
    body: root,
    readyState: "complete",
    querySelector: (selector) => root.querySelector(selector),
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    createTreeWalker: () => ({ nextNode: () => null }),
    addEventListener: () => {}
  };

  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      observers.push(this);
    }

    observe() {}
  }

  const context = vm.createContext({
    URL,
    Element: FakeElement,
    MutationObserver: FakeMutationObserver,
    NodeFilter: { SHOW_TEXT: 4 },
    document,
    location: {
      href: "https://www.zhihu.com/",
      protocol: "https:",
      hostname: "www.zhihu.com",
      pathname: "/"
    },
    requestAnimationFrame: (callback) => callback(),
    setInterval: () => 0
  });

  vm.runInContext(rulesSource, context);
  vm.runInContext(contentSource, context);
  return observers[0];
}

test("nested FeedItem nodes resolve to the outer recommendation card", () => {
  const { root, outer, inner } = createAnswerCard("今天晚饭做什么？");
  runContentScript(root);

  assert.equal(outer.classList.contains(HIDDEN_CARD_CLASS), true);
  assert.equal(inner.classList.contains(HIDDEN_CARD_CLASS), false);
});

test("expansion DOM changes do not discard previously found relevant evidence", () => {
  const { root, outer, title } = createAnswerCard("大模型的推理成本会继续下降吗？");
  const observer = runContentScript(root);
  assert.equal(outer.classList.contains(HIDDEN_CARD_CLASS), false);

  // 模拟展开时折叠摘要被一个暂时不含主题关键词的新正文节点替换。
  title.textContent = "正文加载中";
  observer.callback([{ type: "characterData", target: { parentElement: title } }]);

  assert.equal(outer.classList.contains(HIDDEN_CARD_CLASS), false);
});
