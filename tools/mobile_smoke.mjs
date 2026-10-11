import { chromium } from "playwright-core";
import fs from "node:fs";

const widths = [
  { name: "flip-cover-small", width: 280, height: 720 },
  { name: "flip-cover", width: 320, height: 740 },
  { name: "fold7-cover", width: 360, height: 800 },
  { name: "fold8-cover", width: 384, height: 832 },
  { name: "galaxy-s", width: 412, height: 915 },
  { name: "flip-main", width: 440, height: 960 },
  { name: "fold-main-narrow", width: 740, height: 930 },
  { name: "fold-main-wide", width: 840, height: 1000 },
  { name: "desktop", width: 1360, height: 900 }
];
const base = process.env.TEST_URL || "http://127.0.0.1:4173/";
const screenshotDir = "qa-screenshots";
fs.mkdirSync(screenshotDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const problems = [];
try {
  for (const spec of widths) {
    const page = await browser.newPage({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true
    });
    const errors = [];
    page.on("pageerror", err => errors.push(err.message));
    try {
      await page.goto(base, { waitUntil: "load", timeout: 25000 });
      await page.waitForFunction(() =>
        window.__WTI_TEST__ && window.__WTI_TEST__.getSummary().count > 1000,
        null, { timeout: 18000 });
      const checks = await page.evaluate(() => {
        const qa = window.__WTI_TEST__.getSummary();
        const $ = name => document.getElementById(name);
        const main = document.querySelector(".grid-main");
        const chart = $("priceChart");
        const score = $("scoreRingValue");
        const value = Number(score.textContent);
        const bounds = chart.getBoundingClientRect();
        const viewBox = chart.getAttribute("viewBox").split(" ").map(Number);
        const children = document.querySelector(".topbar").getBoundingClientRect();
        const bodyWidth = document.documentElement.scrollWidth;
        return {
          prices: qa.count,
          lastDate: qa.last.date,
          lastClose: qa.last.close,
          score: value,
          width: innerWidth,
          scrollWidth: bodyWidth,
          overflow: bodyWidth - innerWidth,
          chartWidth: Math.round(bounds.width),
          chartViewBoxWidth: viewBox[2],
          gridColumns: getComputedStyle(main).gridTemplateColumns,
          ringVisible: $("scoreRing").getBoundingClientRect().width > 0,
          tabsVisible: getComputedStyle(document.querySelector(".mobile-tabbar")).display !== "none",
          headerFits: children.right <= innerWidth + 1
        };
      });
      const reasons = [];
      if (checks.overflow > 2) reasons.push("horizontal overflow " + checks.overflow + "px");
      if (checks.chartWidth < 180 || checks.chartViewBoxWidth < 232) reasons.push("chart too narrow");
      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(checks.lastDate) || !Number.isFinite(checks.lastClose) || checks.lastClose <= 0) reasons.push("invalid settlement");
      if (!Number.isFinite(checks.score) || checks.score < 0 || checks.score > 100) reasons.push("invalid bull score");
      if (!checks.ringVisible) reasons.push("circular gauge not visible");
      if (!checks.headerFits) reasons.push("header overflow");
      if (spec.width >= 700 && spec.width <= 1180 && checks.gridColumns.trim().split(/ +/).length !== 2) reasons.push("Fold main not dual column");
      if (spec.width < 700 && !checks.tabsVisible) reasons.push("mobile nav not visible");
      if (errors.length) reasons.push("page errors: " + errors.join("; "));
      const suffix = reasons.length ? "FAIL" : "PASS";
      console.log(suffix + " " + spec.name + " (" + spec.width + "x" + spec.height + ") " + JSON.stringify(checks));
      if (reasons.length) problems.push(spec.name + ": " + reasons.join(" / "));
      await page.screenshot({ path: screenshotDir + "/" + spec.name + ".png", fullPage: false });
      if (spec.width === 384) {
        await page.locator("#rangeControls button[data-range='21']").click();
        await page.locator("#studyControls button[data-study='macd']").click();
        await page.locator("#horizonCards button").nth(1).click();
        if (await page.locator("#oscPanels svg").count() < 2) problems.push("chart indicator toggle did not show MACD");
        const ring = await page.locator("#scoreRingValue").textContent();
        const selected = (await page.locator("#horizonCards button.active strong").textContent()).trim().split(/\\s+/)[0];
        if (ring !== selected) problems.push("1-month horizon did not synchronize circular score (ring " + ring + ", card " + selected + ")");
      }
    } catch (e) {
      problems.push(spec.name + ": " + e.message);
      console.error("FAIL " + spec.name + ": " + e.stack);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
if (problems.length) {
  console.error("MOBILE QA FAILED:\n" + problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Mobile QA passed across Flip, Fold, Galaxy S and desktop viewports.");
}
