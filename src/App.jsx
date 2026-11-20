import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClientInstance } from "@/lib/query-client";
import { OrgProvider, PLATFORM_HOME, Spinner, isPlatformHost, useOrg } from "@/lib/org";
import CampaignPage, { OrgHome, ProjectorPage } from "@/pages/OrgPages";
import { AllDonationsPage, CenterMessage, DonatePage, KioskPage, LegacyRedirect, LoginPage, ThankYouPage } from "@/pages/PublicPages";
import { PlatformPage, StartPage } from "@/pages/PlatformPages";
import SetupRecurring from "@/pages/SetupRecurring";
import { AdminLayout, Dashboard, Donations } from "@/pages/admin/Admin";
import { Campaigns, Members, Settings } from "@/pages/admin/Manage";
import Setup from "@/pages/admin/Setup";
import CreatePoster from "@/pages/admin/CreatePoster";

function Message({ title, children }) {
  return <CenterMessage title={title}>{children}</CenterMessage>;
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
      <Route path="/" element={<OrgHome />} />
      <Route path="/screen" element={<ProjectorPage />} />
      <Route path="/c/:slug" element={<CampaignPage />} />
      <Route path="/c/:slug/screen" element={<ProjectorPage />} />
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
