import { MemorySessionStorage } from "./toolkit/session/memory.js";
import { defaultRedisStorage } from "./toolkit/session/redis.js";
import type { StorageAdapter } from "grammy";

export interface AccountListing {
  id: string;
  title: string;
  country: string;
  age: string;
  price: number;
  status: "available" | "sold";
  credentials: string;
}

export interface Order {
  id: string;
  buyer_telegram_id: number;
  listing_id: string;
  price: number;
  payment_status: "pending" | "completed" | "failed";
  delivery_timestamp?: number;
}

export interface BuyerProfile {
  telegram_id: number;
  display_name: string;
  purchase_history: string[];
}

export interface AuditLogEntry {
  action: string;
  performed_by: number;
  timestamp: number;
  details: string;
}

export interface DataShape {
  listings: AccountListing[];
  orders: Order[];
  buyers: BuyerProfile[];
  listingIndex: string[];
  currency: string;
  owner_id?: number;
  admin_id?: number;
  admin_audit_log: AuditLogEntry[];
}

function resolveDataStorage(): StorageAdapter<DataShape> {
  if (typeof process !== "undefined" && process.env.REDIS_URL) {
    return defaultRedisStorage<DataShape>(process.env.REDIS_URL);
  }
  return new MemorySessionStorage<DataShape>();
}

let dataStorage: StorageAdapter<DataShape> = resolveDataStorage();

export function resetDataStore(): void {
  dataStorage = resolveDataStorage();
}

const defaultData: DataShape = {
  listings: [],
  orders: [],
  buyers: [],
  listingIndex: [],
  currency: "USD",
  admin_audit_log: [],
};

export async function getData(): Promise<DataShape> {
  const data = await dataStorage.read("data");
  return data ?? { ...defaultData, listings: [], orders: [], buyers: [], listingIndex: [] };
}

export async function setData(data: DataShape): Promise<void> {
  await dataStorage.write("data", data);
}

export async function addListing(listing: AccountListing): Promise<void> {
  const data = await getData();
  data.listings.push(listing);
  data.listingIndex.push(listing.id);
  await setData(data);
}

export async function getListing(id: string): Promise<AccountListing | undefined> {
  const data = await getData();
  return data.listings.find((l) => l.id === id);
}

export async function updateListing(id: string, updates: Partial<AccountListing>): Promise<void> {
  const data = await getData();
  const idx = data.listings.findIndex((l) => l.id === id);
  if (idx >= 0) {
    data.listings[idx] = { ...data.listings[idx], ...updates };
    await setData(data);
  }
}

export async function removeListing(id: string): Promise<void> {
  const data = await getData();
  data.listings = data.listings.filter((l) => l.id !== id);
  data.listingIndex = data.listingIndex.filter((lid) => lid !== id);
  await setData(data);
}

export async function getAvailableListings(): Promise<AccountListing[]> {
  const data = await getData();
  return data.listings.filter((l) => l.status === "available");
}

export async function addOrder(order: Order): Promise<void> {
  const data = await getData();
  data.orders.push(order);
  await setData(data);
}

export async function getOrder(id: string): Promise<Order | undefined> {
  const data = await getData();
  return data.orders.find((o) => o.id === id);
}

export async function updateOrder(id: string, updates: Partial<Order>): Promise<void> {
  const data = await getData();
  const idx = data.orders.findIndex((o) => o.id === id);
  if (idx >= 0) {
    data.orders[idx] = { ...data.orders[idx], ...updates };
    await setData(data);
  }
}

export async function getOrdersByBuyer(buyerId: number): Promise<Order[]> {
  const data = await getData();
  return data.orders.filter((o) => o.buyer_telegram_id === buyerId);
}

export async function getBuyerProfile(telegramId: number): Promise<BuyerProfile | undefined> {
  const data = await getData();
  return data.buyers.find((b) => b.telegram_id === telegramId);
}

export async function upsertBuyerProfile(profile: BuyerProfile): Promise<void> {
  const data = await getData();
  const idx = data.buyers.findIndex((b) => b.telegram_id === profile.telegram_id);
  if (idx >= 0) {
    data.buyers[idx] = profile;
  } else {
    data.buyers.push(profile);
  }
  await setData(data);
}

export async function setCurrency(currency: string): Promise<void> {
  const data = await getData();
  data.currency = currency;
  await setData(data);
}

export async function getCurrency(): Promise<string> {
  const data = await getData();
  return data.currency;
}

export async function setOwnerId(id: number): Promise<void> {
  const data = await getData();
  data.owner_id = id;
  await setData(data);
}

export async function getOwnerId(): Promise<number | undefined> {
  const data = await getData();
  return data.owner_id;
}

export async function resetData(): Promise<void> {
  await dataStorage.delete("data");
}

export async function getAdminId(): Promise<number | undefined> {
  const data = await getData();
  return data.admin_id;
}

export async function setAdminId(id: number): Promise<void> {
  const data = await getData();
  data.admin_id = id;
  await setData(data);
}

export async function addAuditLogEntry(entry: AuditLogEntry): Promise<void> {
  const data = await getData();
  data.admin_audit_log.push(entry);
  await setData(data);
}

export async function getAdminAuditLog(): Promise<AuditLogEntry[]> {
  const data = await getData();
  return data.admin_audit_log;
}
