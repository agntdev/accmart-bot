import { Composer } from "grammy";
import type { Ctx } from "../bot.js";
import { inlineButton, inlineKeyboard } from "../toolkit/index.js";
import {
  getOwnerId,
  getAdminId,
  setAdminId,
  addAuditLogEntry,
} from "../storage.js";

async function isOwner(userId: number): Promise<boolean> {
  const ownerId = await getOwnerId();
  return ownerId === userId;
}

const composer = new Composer<Ctx>();

composer.command("set_admin_id", async (ctx) => {
  if (!(await isOwner(ctx.from!.id))) {
    await ctx.reply("You don't have access to admin controls.");
    return;
  }
  await startSetAdminFlow(ctx);
});

async function startSetAdminFlow(ctx: Ctx) {
  ctx.session.step = "awaiting_admin_id";
  ctx.session.flow = { type: "set_admin_id" };
  const current = await getAdminId();
  const currentText = current !== undefined ? `Current admin ID: ${current}\n\n` : "";
  await ctx.reply(
    currentText + "Send the new admin Telegram ID (numeric) or 'cancel'.",
    { reply_markup: { force_reply: true, input_field_placeholder: "Admin ID…" } },
  );
}

composer.on("message:text", async (ctx, next) => {
  const step = ctx.session.step;

  if (!step && ctx.message.text === "Change admin ID") {
    if (!(await isOwner(ctx.from!.id))) {
      await ctx.reply("You don't have access to admin controls.");
      return;
    }
    await startSetAdminFlow(ctx);
    return;
  }

  if (step !== "awaiting_admin_id") return next();
  const flow = ctx.session.flow;
  if (!flow || flow.type !== "set_admin_id") return next();
  if (ctx.message.text.startsWith("/")) return next();

  const text = ctx.message.text.trim();

  if (text.toLowerCase() === "cancel") {
    ctx.session.step = undefined;
    ctx.session.flow = undefined;
    await ctx.reply("Cancelled.", {
      reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
    });
    return;
  }

  const newId = parseInt(text, 10);
  if (isNaN(newId) || newId <= 0) {
    await ctx.reply("Please send a valid numeric Telegram user ID.", {
      reply_markup: { force_reply: true, input_field_placeholder: "Admin ID…" },
    });
    return;
  }

  const oldId = await getAdminId();
  await setAdminId(newId);

  ctx.session.step = undefined;
  ctx.session.flow = undefined;

  const performed_by = ctx.from!.id;
  const timestamp = Date.now();
  const details = oldId !== undefined
    ? "Changed admin ID from " + oldId + " to " + newId
    : "Set admin ID to " + newId;
  await addAuditLogEntry({ action: "set_admin_id", performed_by, timestamp, details });

  let confirmText: string;
  if (oldId !== undefined) {
    confirmText = "✅ Admin ID updated.\n\nOld: " + oldId + "\nNew: " + newId;
  } else {
    confirmText = "✅ Admin ID set to " + newId + ".";
  }
  await ctx.reply(confirmText, {
    reply_markup: inlineKeyboard([[inlineButton("⬅️ Back to menu", "menu:main")]]),
  });

  try {
    await ctx.api.sendMessage(newId, "You have been configured as admin for sales notifications.");
  } catch {
    // New admin may not have started the bot yet.
  }

  if (oldId !== undefined && oldId !== newId) {
    try {
      await ctx.api.sendMessage(oldId, "You have been removed as admin for sales notifications.");
    } catch {
      // Old admin may not have started the bot or may have blocked it.
    }
  }
});

export default composer;
