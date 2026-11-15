import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { queryClientInstance } from "@/lib/query-client";
import { OrgProvider, Spinner, useOrg } from "@/lib/org";
import CampaignPage from "@/pages/CampaignPage";
import { AllDonationsPage, DonatePage, KioskPage, LegacyRedirect, LoginPage, ThankYouPage } from "@/pages/PublicPages";
import SetupRecurring from "@/pages/SetupRecurring";
import { AdminLayout, Dashboard, Donations } from "@/pages/admin/Admin";
import { Campaigns, Members, Settings } from "@/pages/admin/Manage";
import CreatePoster from "@/pages/admin/CreatePoster";

function Site() {
  const { org } = useOrg();
  if (org === undefined) return <Spinner />;
  if (!org) return <div className="min-h-screen flex items-center justify-center text-gray-500 p-8 text-center">This fundraising site has not been set up yet.</div>;
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
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Dashboard />} />
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
