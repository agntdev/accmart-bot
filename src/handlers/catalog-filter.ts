import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard, paginate } from "../toolkit/index.js";
import { getAvailableListings, getCurrency, type AccountListing } from "../storage.js";

registerMainMenuItem({ label: "🌐 Browse Catalog", data: "catalog:filter", order: 10 });

const ITEMS_PER_PAGE = 8;

const composer = new Composer<Ctx>();

composer.callbackQuery("catalog:filter", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = "catalog_browse";
  ctx.session.flow = { type: "catalog_browse", page: 0, filters: {} };
  await showFilters(ctx);
});

composer.callbackQuery(/^catalog:set_country:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const country = ctx.match![1];
  if (!ctx.session.flow) ctx.session.flow = { type: "catalog_browse", page: 0, filters: {} };
  ctx.session.flow.filters = ctx.session.flow.filters ?? {};
  ctx.session.flow.filters.country = country === "all" ? undefined : country;
  ctx.session.flow.page = 0;
  await showCatalog(ctx);
});

composer.callbackQuery(/^catalog:set_age:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const age = ctx.match![1];
  if (!ctx.session.flow) ctx.session.flow = { type: "catalog_browse", page: 0, filters: {} };
  ctx.session.flow.filters = ctx.session.flow.filters ?? {};
  ctx.session.flow.filters.age = age === "all" ? undefined : age;
  ctx.session.flow.page = 0;
  await showCatalog(ctx);
});

composer.callbackQuery(/^catalog:set_price:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const price = ctx.match![1];
  if (!ctx.session.flow) ctx.session.flow = { type: "catalog_browse", page: 0, filters: {} };
  ctx.session.flow.filters = ctx.session.flow.filters ?? {};
  if (price === "all") {
    ctx.session.flow.filters.price_min = undefined;
    ctx.session.flow.filters.price_max = undefined;
  } else if (price === "under50") {
    ctx.session.flow.filters.price_min = undefined;
    ctx.session.flow.filters.price_max = 50;
  } else if (price === "50to100") {
    ctx.session.flow.filters.price_min = 50;
    ctx.session.flow.filters.price_max = 100;
  } else if (price === "over100") {
    ctx.session.flow.filters.price_min = 100;
    ctx.session.flow.filters.price_max = undefined;
  }
  ctx.session.flow.page = 0;
  await showCatalog(ctx);
});

composer.callbackQuery(/^catalog:page:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const page = parseInt(ctx.match![1], 10);
  if (ctx.session.flow) ctx.session.flow.page = page;
  await showCatalog(ctx);
});

composer.callbackQuery(/^catalog:view:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const listingId = ctx.match![1];
  const listing = (await getAvailableListings()).find((l) => l.id === listingId);
  if (!listing) {
    await ctx.editMessageText("That listing is no longer available.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to catalog", "catalog:filter")]]),
    });
    return;
  }
  const currency = await getCurrency();
  const text =
    `📋 ${listing.title}\n\n` +
    `Country: ${listing.country}\n` +
    `Age: ${listing.age}\n` +
    `Price: ${currency} ${listing.price}\n\n` +
    `Ready to buy? Tap the button below to checkout.`;
  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("💳 Buy now", `purchase:init:${listing.id}`)],
      [inlineButton("⬅️ Back to catalog", "catalog:filter")],
    ]),
  });
});

async function showFilters(ctx: Ctx) {
  const currency = await getCurrency();
  const text =
    "🌐 Browse Catalog\n\n" +
    "Filter by country, age, or price — then tap a listing to view details.";
  const keyboard = inlineKeyboard([
    [
      inlineButton("🌍 Country", "noop"),
      inlineButton("📅 Age", "noop"),
      inlineButton("💰 Price", "noop"),
    ],
    [
      inlineButton("🇺🇸 US", "catalog:set_country:US"),
      inlineButton("🇬🇧 UK", "catalog:set_country:UK"),
      inlineButton("🇩🇪 DE", "catalog:set_country:DE"),
      inlineButton("🌐 All", "catalog:set_country:all"),
    ],
    [
      inlineButton("18–25", "catalog:set_age:18-25"),
      inlineButton("26–35", "catalog:set_age:26-35"),
      inlineButton("36+", "catalog:set_age:36+"),
      inlineButton("Any age", "catalog:set_age:all"),
    ],
    [
      inlineButton(`Under ${currency}50`, "catalog:set_price:under50"),
      inlineButton(`${currency}50–100`, "catalog:set_price:50to100"),
      inlineButton(`Over ${currency}100`, "catalog:set_price:over100"),
      inlineButton("Any price", "catalog:set_price:all"),
    ],
    [inlineButton("View all listings", "catalog:view_all")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  await ctx.editMessageText(text, { reply_markup: keyboard });
}

composer.callbackQuery("catalog:view_all", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (ctx.session.flow) ctx.session.flow.filters = {};
  await showCatalog(ctx);
});

async function showCatalog(ctx: Ctx) {
  let listings = await getAvailableListings();
  const filters = ctx.session.flow?.filters;
  if (filters) {
    if (filters.country) listings = listings.filter((l) => l.country === filters.country);
    if (filters.age) {
      listings = listings.filter((l) => {
        if (filters.age === "18-25") return l.age >= "18" && l.age <= "25";
        if (filters.age === "26-35") return l.age >= "26" && l.age <= "35";
        if (filters.age === "36+") return l.age >= "36";
        return true;
      });
    }
    if (filters.price_min !== undefined) listings = listings.filter((l) => l.price >= filters.price_min!);
    if (filters.price_max !== undefined) listings = listings.filter((l) => l.price <= filters.price_max!);
  }

  if (listings.length === 0) {
    await ctx.editMessageText(
      "No listings match your filters.\n\nTry adjusting your filters or check back later.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🔧 Change filters", "catalog:filter")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const currency = await getCurrency();
  const page = ctx.session.flow?.page ?? 0;
  const { pageItems, totalPages, page: actualPage, controls } = paginate(listings, {
    page,
    perPage: ITEMS_PER_PAGE,
    callbackPrefix: "catalog:page",
  });

  if (ctx.session.flow) ctx.session.flow.page = actualPage;

  const rows = pageItems.map((item) => [
    inlineButton(`${item.title} — ${currency} ${item.price}`, `catalog:view:${item.id}`),
  ]);

  const keyboard = inlineKeyboard([
    ...rows,
    ...controls.inline_keyboard,
    [inlineButton("🔧 Filters", "catalog:filter")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);

  const filterSummary = formatFilters(filters);
  const text =
    `🌐 Catalog (${listings.length} listing${listings.length === 1 ? "" : "s"})${filterSummary}\n\n` +
    `Page ${actualPage + 1} of ${totalPages}\n` +
    `Tap a listing to view details.`;

  await ctx.editMessageText(text, { reply_markup: keyboard });
}

function formatFilters(filters?: { country?: string; age?: string; price_min?: number; price_max?: number }): string {
  if (!filters) return "";
  const parts: string[] = [];
  if (filters.country) parts.push(`Country: ${filters.country}`);
  if (filters.age) parts.push(`Age: ${filters.age}`);
  if (filters.price_min !== undefined || filters.price_max !== undefined) {
    const min = filters.price_min ?? "0";
    const max = filters.price_max ?? "∞";
    parts.push(`Price: ${min}–${max}`);
  }
  return parts.length > 0 ? `\nFiltered: ${parts.join(", ")}` : "";
}

export default composer;
