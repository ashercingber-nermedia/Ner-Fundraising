# Ner Media Fundraising

One app for many organizations. Each organization has its own branding, campaigns, admins and Stripe account.
Three campaign types: regular, spin raffle, membership.

## Where things live
- **Database + server code**: Supabase project `ner fundraising` (ahtaiifvnplcarbewjve). The schema is in that project's migration history; the server function is `api` (source also in `supabase/functions/api`).
- **Website**: this folder. `npm install`, `npm run build`, publish the `dist` folder (Cloudflare Pages works as-is; `public/_redirects` handles page routing).
- `.env` holds only public values (Supabase address + publishable key + the default organization).

## Pages
| Address | What it is |
|---|---|
| `/` and `/c/<campaign>` | Campaign screen (projector / landing page) |
| `/c/<campaign>/donate` | Donate, join, or spin |
| `/kiosk?key=...` | Tablet + card reader screen (link comes from Admin > Settings) |
| `/admin` | Dashboard, donations, campaigns, members, poster, settings |
| `/login` | Admin sign-in by emailed link |

Old Base44 addresses (`/Donate`, `/DonateProspectHeights`, `/SetupRecurring?token=...`) redirect to the new ones.

## Platform settings (Supabase > Edge Functions > Secrets)
| Name | Purpose |
|---|---|
| `STRIPE_PLATFORM_SECRET_KEY`, `STRIPE_PLATFORM_PUBLISHABLE_KEY` | Ner Media's Stripe account with Connect turned on; used to create each customer's Stripe account |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Signing secret of the Connect webhook pointing at `<supabase>/functions/v1/api/stripe-webhook` |
| `RESEND_API_KEY`, `RECEIPT_FROM_EMAIL` | Sends receipts and setup-link emails |
| `PLATFORM_HOSTS` | Comma-separated site hostnames allowed as payment return addresses (e.g. `give.nermediagroup.com`) |

Webhook events needed: `checkout.session.completed`, `payment_intent.succeeded`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `account.updated`.

## Adding a customer
1. Insert a row in `organizations` (slug, name, address, tax ID, domains).
2. Add an `org_invites` row with the customer's email; they sign in at `/login`.
3. They finish Settings (Stripe, logo, colors) and create campaigns.
