# Telegram Account Store — Bot specification

**Archetype:** commerce

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A single-seller Telegram bot that allows the owner to list Telegram accounts for sale. Buyers can browse a filtered catalog (by country, age, price), purchase accounts via Telegram Checkout, and receive credentials instantly in private messages. The owner manages listings and receives admin notifications on sales.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Seller (bot owner)
- Buyers seeking Telegram accounts

## Success criteria

- Buyer receives account credentials in private message after successful payment
- Orders are recorded with payment status and delivery timestamp
- Seller receives admin notification with order details on each sale

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with options: Browse Catalog, My Purchases, Help
- **Browse Catalog** (button, actor: user, callback: catalog:filter) — Open catalog filters for country, age range, and price range
  - inputs: country, age_range, price_range
  - outputs: paginated catalog list with 'View details' buttons
- **Buy** (button, actor: user, callback: purchase:init) — Initiate purchase flow for selected account listing
  - inputs: listing_id
  - outputs: Telegram Checkout popup
- **/admin** (command, actor: seller, command: /admin) — Open admin menu for owner-only actions
  - inputs: telegram_user_id
  - outputs: Add Listing, Edit Listing, Remove Listing, View Sales options

## Flows

### Catalog browsing
_Trigger:_ button:Browse Catalog

1. Show filters for country, age, price
2. Apply filters to generate catalog view
3. Show 8 items per page with 'View details' buttons
4. Allow pagination through catalog

_Data touched:_ Account listing

### Purchase flow
_Trigger:_ button:Buy

1. Display listing details
2. Open Telegram Checkout with price in seller's currency
3. Process payment confirmation
4. Mark listing as sold
5. Generate order record
6. Send credentials via private message
7. Notify seller admin chat

_Data touched:_ Account listing, Order, Buyer profile

### Admin controls
_Trigger:_ /admin

1. Verify owner Telegram ID
2. Show admin menu options
3. Process Add/Edit/Remove listing requests
4. Display sales history with filters

_Data touched:_ Account listing, Order

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Account listing** _(retention: persistent)_ — Available Telegram accounts for sale
  - fields: id, title, country, age, price, status, credentials
- **Order** _(retention: persistent)_ — Completed purchase records
  - fields: id, buyer_telegram_id, listing_id, price, payment_status, delivery_timestamp
- **Buyer profile** _(retention: persistent)_ — User purchase history and identity
  - fields: telegram_id, display_name, purchase_history

## Integrations

- **Telegram** (required) — Bot API messaging and payment processing
- **Telegram Checkout** (required) — Handle payments within Telegram
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Add new account listings with credentials
- Edit existing listing details
- Remove listings
- View sales history with filters
- Set default currency during setup

## Notifications

- Admin chat notification to seller with order details on successful purchase

## Permissions & privacy

- Only owner can access admin controls via verified Telegram ID
- Buyer credentials stored encrypted at rest
- No automated refund processing - owner manually handles disputes

## Edge cases

- Payment timeout during checkout
- Duplicate purchase attempts for sold listing
- Failed delivery of credentials to buyer
- Invalid admin access attempts by non-owner users

## Required tests

- End-to-end purchase flow: filter catalog → select listing → checkout → credential delivery → admin notification
- Admin controls: verify owner-only access to listing management
- Data encryption: confirm credentials remain encrypted in storage

## Assumptions

- Seller will provide valid Telegram user ID for admin authentication
- All prices will be set in a single currency (set during initial configuration)
- Buyers will have Telegram accounts configured for Checkout payments
