import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  getAvailableListings,
  getListing,
  getOrder,
  addOrder,
  updateOrder,
  updateListing,
  getBuyerProfile,
  upsertBuyerProfile,
  getCurrency,
  getOwnerId,
  type Order,
} from "../storage.js";

const composer = new Composer<Ctx>();

composer.callbackQuery(/^purchase:init:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const listingId = ctx.match![1];
  const listing = (await getAvailableListings()).find((l) => l.id === listingId);

  if (!listing) {
    await ctx.editMessageText("Sorry, that listing is no longer available.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to catalog", "catalog:filter")]]),
    });
    return;
  }

  const currency = await getCurrency();
  const buyerId = ctx.from!.id;
  const existing = await getBuyerProfile(buyerId);
  if (!existing) {
    await upsertBuyerProfile({
      telegram_id: buyerId,
      display_name: ctx.from.first_name ?? "Buyer",
      purchase_history: [],
    });
  }

  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const order: Order = {
    id: orderId,
    buyer_telegram_id: buyerId,
    listing_id: listingId,
    price: listing.price,
    payment_status: "pending",
  };
  await addOrder(order);

  try {
    await ctx.api.sendInvoice(
      ctx.chat!.id,
      listing.title,
      `Telegram account from ${listing.country}, age ${listing.age}`,
      `order:${orderId}`,
      currency,
      [{ label: listing.title, amount: listing.price * 100 }],
    );
  } catch {
    await ctx.editMessageText(
      "Couldn't start checkout right now. Try again in a moment.",
      {
        reply_markup: inlineKeyboard([
          [inlineButton("⬅️ Back to catalog", "catalog:filter")],
        ]),
      },
    );
  }
});

composer.on("pre_checkout_query", async (ctx) => {
  const data = ctx.preCheckoutQuery.invoice_payload;
  if (!data?.startsWith("order:")) {
    await ctx.api.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, false);
    return;
  }

  const orderId = data.slice(6);
  const order = await getOrder(orderId);
  if (!order) {
    await ctx.api.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, false);
    return;
  }

  const listing = await getListing(order.listing_id);
  if (!listing || listing.status !== "available") {
    await ctx.api.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, false);
    return;
  }

  await ctx.api.answerPreCheckoutQuery(ctx.preCheckoutQuery.id, true);
});

composer.on("message:successful_payment", async (ctx) => {
  const payment = ctx.message!.successful_payment!;
  const invoicePayload = payment.invoice_payload;
  if (!invoicePayload?.startsWith("order:")) return;

  const orderId = invoicePayload.slice(6);
  const order = await getOrder(orderId);
  if (!order) return;

  const listing = await getListing(order.listing_id);
  if (!listing) return;

  await updateOrder(orderId, {
    payment_status: "completed",
    delivery_timestamp: Date.now(),
  });
  await updateListing(order.listing_id, { status: "sold" });

  const profile = await getBuyerProfile(order.buyer_telegram_id);
  if (profile) {
    profile.purchase_history.push(orderId);
    await upsertBuyerProfile(profile);
  }

  const credentialsText = `🔑 Account Credentials\n\n` +
    `Title: ${listing.title}\n` +
    `Country: ${listing.country}\n` +
    `Age: ${listing.age}\n\n` +
    `Credentials:\n${listing.credentials}\n\n` +
    `Keep these safe — they won't be shown again.`;

  try {
    await ctx.api.sendMessage(order.buyer_telegram_id, credentialsText);
  } catch {
    // Delivery failed — user may have blocked the bot. Log and continue.
  }

  const ownerId = await getOwnerId();
  if (ownerId) {
    const currency = await getCurrency();
    const adminText =
      `💰 New Sale!\n\n` +
      `Account: ${listing.title}\n` +
      `Buyer: ${ctx.from.first_name} (${ctx.from.id})\n` +
      `Price: ${currency} ${order.price}\n` +
      `Order: ${orderId}`;
    try {
      await ctx.api.sendMessage(ownerId, adminText);
    } catch {
      // Owner may not have started the bot yet.
    }
  }
});

export default composer;
