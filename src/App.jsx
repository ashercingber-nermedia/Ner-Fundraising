import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClientInstance } from "@/lib/query-client";
import { OrgProvider, PLATFORM_HOME, Spinner, isPlatformHost, useOrg } from "@/lib/org";
import CampaignPage from "@/pages/CampaignPage";
import { AllDonationsPage, DonatePage, KioskPage, LegacyRedirect, LoginPage, ThankYouPage } from "@/pages/PublicPages";
import { PlatformPage, StartPage } from "@/pages/PlatformPages";
import SetupRecurring from "@/pages/SetupRecurring";
import { AdminLayout, Dashboard, Donations } from "@/pages/admin/Admin";
import { Campaigns, Members, Settings } from "@/pages/admin/Manage";
import Setup from "@/pages/admin/Setup";
import CreatePoster from "@/pages/admin/CreatePoster";
import NerBadge from "@/components/NerBadge";

function Message({ title, children }) {
  return (
    <div className="min-h-screen bg-[#ede8e1] flex flex-col items-center justify-center gap-3 p-8 text-center text-[#1a2d5a]">
      <p className="text-2xl font-semibold">{title}</p>
      {children && <p className="text-[#1a2d5a]/70 max-w-md">{children}</p>}
      <NerBadge className="mt-4" />
    </div>
  );
}

// The platform itself: signup page and the Ner Media owner page.
function PlatformSite() {
  return (
    <Routes>
      <Route path="/" element={<StartPage />} />
      <Route path="/start" element={<StartPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/platform" element={<PlatformPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function Site() {
  const { org, isAdmin } = useOrg();
  if (org === undefined) return <Spinner />;
  if (!org) {
    if (isPlatformHost()) return <PlatformSite />;
    return (
      <Message title="No fundraising site here yet">
        Want this address? <a className="underline" href={`${PLATFORM_HOME}/start`}>Create a free fundraising site</a>.
      </Message>
    );
  }
  // A new site stays private until its owner clicks the link in their email; admins always get through.
  const adminPath = window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/login");
  if (org.status === "suspended" && !isAdmin && !adminPath) return <Message title="This site is not available" />;
  if (org.status === "pending" && !isAdmin && !adminPath) {
    return <Message title={`${org.name}`}>This fundraising site is being set up. Please check back soon.</Message>;
  }
  return (
    <Routes>
      <Route path="/" element={<CampaignPage />} />
      <Route path="/c/:slug" element={<CampaignPage />} />
      <Route path="/c/:slug/donate" element={<DonatePage />} />
      <Route path="/c/:slug/all" element={<AllDonationsPage />} />
      <Route path="/all" element={<AllDonationsPage />} />
      <Route path="/thank-you" element={<ThankYouPage />} />
      <Route path="/setup-recurring" element={<SetupRecurring />} />
      <Route path="/kiosk" element={<KioskPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/platform" element={<PlatformPage />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="setup" element={<Setup />} />
        <Route path="donations" element={<Donations />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="members" element={<Members />} />
        <Route path="settings" element={<Settings />} />
        <Route path="poster" element={<CreatePoster />} />
      </Route>
      <Route path="*" element={<LegacyRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <OrgProvider>
        <BrowserRouter>
          <Site />
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </OrgProvider>
    </QueryClientProvider>
  );
}
