import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { registerMainMenuItem, inlineButton, inlineKeyboard } from "../toolkit/index.js";
import { getOrdersByBuyer, getListing, getCurrency } from "../storage.js";

registerMainMenuItem({ label: "📋 My Purchases", data: "purchases:view", order: 30 });

const composer = new Composer<Ctx>();

composer.callbackQuery("purchases:view", async (ctx) => {
  await ctx.answerCallbackQuery();
  const buyerId = ctx.from.id;
  const orders = await getOrdersByBuyer(buyerId);

  if (orders.length === 0) {
    await ctx.editMessageText(
      "📋 No purchases yet.\n\nBrowse the catalog to find an account.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("🌐 Browse Catalog", "catalog:filter")],
          [inlineButton("⬅️ Back to menu", "menu:main")],
        ]),
      },
    );
    return;
  }

  const currency = await getCurrency();
  let text = "📋 Your Purchases\n\n";

  for (const order of orders.slice(-10).reverse()) {
    const listing = await getListing(order.listing_id);
    const status = order.payment_status === "completed" ? "✅" : "⏳";
    text += `${status} ${listing?.title ?? "Unknown"} — ${currency} ${order.price}\n`;
    if (order.payment_status === "completed" && order.delivery_timestamp) {
      const date = new Date(order.delivery_timestamp).toLocaleDateString();
      text += `   Delivered: ${date}\n`;
    }
    text += `\n`;
  }

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([
      [inlineButton("🌐 Browse Catalog", "catalog:filter")],
      [inlineButton("⬅️ Back to menu", "menu:main")],
    ]),
  });
});

export default composer;
