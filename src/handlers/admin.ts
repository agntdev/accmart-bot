import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  addListing,
  getAvailableListings,
  getCurrency,
  getData,
  getListing,
  getOwnerId,
  getOrdersByBuyer,
  removeListing,
  setCurrency,
  setOwnerId,
  updateListing,
  type AccountListing,
} from "../storage.js";

async function isOwner(userId: number): Promise<boolean> {
  const ownerId = await getOwnerId();
  return ownerId === userId;
}

const composer = new Composer<Ctx>();

composer.command("admin", async (ctx) => {
  if (!(await isOwner(ctx.from!.id))) {
    await ctx.reply("You don't have access to admin controls.");
    return;
  }
  await showAdminMenu(ctx);
});

composer.callbackQuery("admin:menu", async (ctx) => {
  await ctx.answerCallbackQuery();
  await showAdminMenu(ctx);
});

composer.callbackQuery("admin:add_listing", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isOwner(ctx.from!.id))) {
    await ctx.editMessageText("You don't have access to admin controls.");
    return;
  }
  ctx.session.step = "awaiting_listing_title";
  ctx.session.flow = { type: "add_listing", data: {} };
  await ctx.editMessageText(
    "➕ Add New Listing\n\nSend the account title (e.g. \"US Account — 2yr old\"):",
    { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:cancel_flow")]]) },
  );
});

composer.callbackQuery("admin:edit_listing", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isOwner(ctx.from!.id))) {
    await ctx.editMessageText("You don't have access to admin controls.");
    return;
  }
  const listings = await getAvailableListings();
  if (listings.length === 0) {
    await ctx.editMessageText("No listings to edit yet.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }
  const rows = listings.map((l) => [
    inlineButton(`${l.title} (${l.country})`, `admin:edit_select:${l.id}`),
  ]);
  rows.push([inlineButton("⬅️ Back", "admin:menu")]);
  await ctx.editMessageText("Select a listing to edit:", { reply_markup: inlineKeyboard(rows) });
});

composer.callbackQuery(/^admin:edit_select:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const listingId = ctx.match![1];
  const listing = await getListing(listingId);
  if (!listing) {
    await ctx.editMessageText("Listing not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }
  const currency = await getCurrency();
  const text =
    `✏️ Editing: ${listing.title}\n\n` +
    `Country: ${listing.country}\n` +
    `Age: ${listing.age}\n` +
    `Price: ${currency} ${listing.price}\n` +
    `Status: ${listing.status}`;
  const keyboard = inlineKeyboard([
    [inlineButton("Title", `admin:edit_field:${listingId}:title`)],
    [inlineButton("Country", `admin:edit_field:${listingId}:country`)],
    [inlineButton("Age", `admin:edit_field:${listingId}:age`)],
    [inlineButton("Price", `admin:edit_field:${listingId}:price`)],
    [inlineButton("Credentials", `admin:edit_field:${listingId}:credentials`)],
    [inlineButton("⬅️ Back", "admin:menu")],
  ]);
  await ctx.editMessageText(text, { reply_markup: keyboard });
});

composer.callbackQuery(/^admin:edit_field:(.+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const listingId = ctx.match![1];
  const field = ctx.match![2];
  ctx.session.step = `awaiting_edit_${field}`;
  ctx.session.flow = { type: "edit_listing", data: { listingId, field } };
  const prompts: Record<string, string> = {
    title: "Send the new title:",
    country: "Send the new country code (e.g. US, UK, DE):",
    age: "Send the new age (e.g. 24):",
    price: "Send the new price (number):",
    credentials: "Send the new credentials (username + password):",
  };
  await ctx.editMessageText(`✏️ ${prompts[field] ?? "Send the new value:"}`, {
    reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:cancel_flow")]]),
  });
});

composer.callbackQuery("admin:remove_listing", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isOwner(ctx.from!.id))) {
    await ctx.editMessageText("You don't have access to admin controls.");
    return;
  }
  const listings = await getAvailableListings();
  if (listings.length === 0) {
    await ctx.editMessageText("No listings to remove.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }
  const rows = listings.map((l) => [
    inlineButton(`${l.title}`, `admin:remove_confirm:${l.id}`),
  ]);
  rows.push([inlineButton("⬅️ Back", "admin:menu")]);
  await ctx.editMessageText("Select a listing to remove:", { reply_markup: inlineKeyboard(rows) });
});

composer.callbackQuery(/^admin:remove_confirm:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const listingId = ctx.match![1];
  const listing = await getListing(listingId);
  if (!listing) {
    await ctx.editMessageText("Listing not found.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }
  await ctx.editMessageText(`Are you sure you want to remove "${listing.title}"?`, {
    reply_markup: inlineKeyboard([
      [
        inlineButton("🗑 Remove", `admin:remove_yes:${listingId}`),
        inlineButton("Cancel", "admin:menu"),
      ],
    ]),
  });
});

composer.callbackQuery(/^admin:remove_yes:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const listingId = ctx.match![1];
  await removeListing(listingId);
  await ctx.editMessageText("Listing removed.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
  });
});

composer.callbackQuery("admin:view_sales", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isOwner(ctx.from!.id))) {
    await ctx.editMessageText("You don't have access to admin controls.");
    return;
  }
  const data = await getData();
  const orders = data.orders;
  if (orders.length === 0) {
    await ctx.editMessageText("No sales yet.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }
  const currency = await getCurrency();
  const completed = orders.filter((o) => o.payment_status === "completed");
  const pending = orders.filter((o) => o.payment_status === "pending");
  const totalRevenue = completed.reduce((sum, o) => sum + o.price, 0);

  let text =
    `📊 Sales Summary\n\n` +
    `Total orders: ${orders.length}\n` +
    `Completed: ${completed.length}\n` +
    `Pending: ${pending.length}\n` +
    `Revenue: ${currency} ${totalRevenue}\n\n`;

  if (completed.length > 0) {
    text += `Recent sales:\n`;
    for (const order of completed.slice(-5).reverse()) {
      const listing = data.listings.find((l) => l.id === order.listing_id);
      text += `• ${listing?.title ?? "Unknown"} — ${currency} ${order.price}\n`;
    }
  }

  await ctx.editMessageText(text, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
  });
});

composer.callbackQuery("admin:set_currency", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!(await isOwner(ctx.from!.id))) {
    await ctx.editMessageText("You don't have access to admin controls.");
    return;
  }
  ctx.session.step = "awaiting_currency";
  ctx.session.flow = { type: "set_currency" };
  const current = await getCurrency();
  await ctx.editMessageText(
    `Current currency: ${current}\n\nSend the new currency code (e.g. USD, EUR, GBP):`,
    { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:cancel_flow")]]) },
  );
});

composer.callbackQuery("admin:set_owner", async (ctx) => {
  await ctx.answerCallbackQuery();
  const currentOwner = await getOwnerId();
  if (currentOwner !== undefined && currentOwner !== ctx.from!.id) {
    await ctx.editMessageText("You don't have access to admin controls.");
    return;
  }
  ctx.session.step = "awaiting_owner_id";
  ctx.session.flow = { type: "set_owner" };
  await ctx.editMessageText(
    "Send your Telegram user ID (you can find it via @userinfobot):",
    { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:cancel_flow")]]) },
  );
});

composer.callbackQuery("admin:cancel_flow", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.step = undefined;
  ctx.session.flow = undefined;
  await ctx.editMessageText("Cancelled.", {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
  });
});

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;
  if (!step) return next();

  const flow = ctx.session.flow;
  if (!flow) return next();

  if (ctx.message.text.startsWith("/")) return next();

  if (step === "awaiting_listing_title" && flow.type === "add_listing") {
    flow.data = flow.data ?? {};
    flow.data.title = ctx.message.text.trim();
    ctx.session.step = "awaiting_listing_country";
    await ctx.reply("Send the country code (e.g. US, UK, DE):", {
      reply_markup: { force_reply: true, input_field_placeholder: "Country code…" },
    });
    return;
  }

  if (step === "awaiting_listing_country" && flow.type === "add_listing") {
    flow.data = flow.data ?? {};
    flow.data.country = ctx.message.text.trim().toUpperCase();
    ctx.session.step = "awaiting_listing_age";
    await ctx.reply("Send the account age (e.g. 24):", {
      reply_markup: { force_reply: true, input_field_placeholder: "Age…" },
    });
    return;
  }

  if (step === "awaiting_listing_age" && flow.type === "add_listing") {
    flow.data = flow.data ?? {};
    flow.data.age = ctx.message.text.trim();
    ctx.session.step = "awaiting_listing_price";
    await ctx.reply("Send the price (number):", {
      reply_markup: { force_reply: true, input_field_placeholder: "Price…" },
    });
    return;
  }

  if (step === "awaiting_listing_price" && flow.type === "add_listing") {
    flow.data = flow.data ?? {};
    const price = parseFloat(ctx.message.text.trim());
    if (isNaN(price) || price <= 0) {
      await ctx.reply("Please send a valid price (a positive number).", {
        reply_markup: { force_reply: true, input_field_placeholder: "Price…" },
      });
      return;
    }
    flow.data.price = price;
    ctx.session.step = "awaiting_listing_credentials";
    await ctx.reply("Send the account credentials (username + password):", {
      reply_markup: { force_reply: true, input_field_placeholder: "Credentials…" },
    });
    return;
  }

  if (step === "awaiting_listing_credentials" && flow.type === "add_listing") {
    flow.data = flow.data ?? {};
    flow.data.credentials = ctx.message.text.trim();
    const d = flow.data;
    const listing: AccountListing = {
      id: `LIST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: String(d.title),
      country: String(d.country),
      age: String(d.age),
      price: Number(d.price),
      status: "available",
      credentials: String(d.credentials),
    };
    await addListing(listing);
    ctx.session.step = undefined;
    ctx.session.flow = undefined;
    const currency = await getCurrency();
    await ctx.reply(
      `✅ Listing added!\n\n` +
        `Title: ${listing.title}\n` +
        `Country: ${listing.country}\n` +
        `Age: ${listing.age}\n` +
        `Price: ${currency} ${listing.price}`,
      { reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]) },
    );
    return;
  }

  if (step === "awaiting_currency" && flow.type === "set_currency") {
    const code = ctx.message.text.trim().toUpperCase();
    if (code.length < 2 || code.length > 5) {
      await ctx.reply("Please send a valid currency code (2–5 letters, e.g. USD, EUR).", {
        reply_markup: { force_reply: true, input_field_placeholder: "Currency code…" },
      });
      return;
    }
    await setCurrency(code);
    ctx.session.step = undefined;
    ctx.session.flow = undefined;
    await ctx.reply(`✅ Currency set to ${code}.`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }

  if (step === "awaiting_owner_id" && flow.type === "set_owner") {
    const id = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(id)) {
      await ctx.reply("Please send a valid numeric Telegram user ID.", {
        reply_markup: { force_reply: true, input_field_placeholder: "User ID…" },
      });
      return;
    }
    await setOwnerId(id);
    ctx.session.step = undefined;
    ctx.session.flow = undefined;
    await ctx.reply(`✅ Owner set to ${id}.`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }

  if (step?.startsWith("awaiting_edit_") && flow.type === "edit_listing") {
    const field = flow.data?.field as string;
    const listingId = flow.data?.listingId as string;
    if (!field || !listingId) return next();

    const value = ctx.message.text.trim();
    const updates: Partial<AccountListing> = {};

    if (field === "title") updates.title = value;
    else if (field === "country") updates.country = value.toUpperCase();
    else if (field === "age") updates.age = value;
    else if (field === "price") {
      const price = parseFloat(value);
      if (isNaN(price) || price <= 0) {
        await ctx.reply("Please send a valid price (a positive number).", {
          reply_markup: { force_reply: true, input_field_placeholder: "Price…" },
        });
        return;
      }
      updates.price = price;
    } else if (field === "credentials") updates.credentials = value;

    await updateListing(listingId, updates);
    ctx.session.step = undefined;
    ctx.session.flow = undefined;
    await ctx.reply(`✅ ${field.charAt(0).toUpperCase() + field.slice(1)} updated.`, {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back", "admin:menu")]]),
    });
    return;
  }

  return next();
});

async function showAdminMenu(ctx: Ctx) {
  const ownerId = await getOwnerId();
  if (ownerId === undefined) {
    ctx.session.step = "awaiting_owner_id";
    ctx.session.flow = { type: "set_owner" };
    await ctx.editMessageText(
      "⚙️ Admin Setup\n\nFirst, send your Telegram user ID to set as owner.\nYou can find it via @userinfobot.",
      { reply_markup: inlineKeyboard([[inlineButton("Cancel", "admin:cancel_flow")]]) },
    );
    return;
  }

  if (ownerId !== ctx.from!.id) {
    await ctx.editMessageText("You don't have access to admin controls.");
    return;
  }

  const listings = await getAvailableListings();
  const currency = await getCurrency();
  const text =
    `⚙️ Admin Menu\n\n` +
    `Currency: ${currency}\n` +
    `Active listings: ${listings.length}`;
  const keyboard = inlineKeyboard([
    [inlineButton("➕ Add Listing", "admin:add_listing")],
    [inlineButton("✏️ Edit Listing", "admin:edit_listing")],
    [inlineButton("🗑 Remove Listing", "admin:remove_listing")],
    [inlineButton("📊 View Sales", "admin:view_sales")],
    [inlineButton("💱 Set Currency", "admin:set_currency")],
    [inlineButton("⬅️ Back to menu", "menu:main")],
  ]);
  await ctx.editMessageText(text, { reply_markup: keyboard });
}

export default composer;
