import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { api } from "@/lib/supabase";
import NerBadge from "@/components/NerBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";

// Stripe publishable key is fetched at runtime from the backend session response

function formatCurrency(n) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

function SetupForm({ sessionInfo, token, onComplete }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError, setupIntent } = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });

    if (confirmError) {
      setError(confirmError.message);
      setSubmitting(false);
      return;
    }

    try {
      onComplete(await api("setup_recurring_confirm", { token, setup_intent_id: setupIntent.id }));
    } catch (err) {
      setError(err.message || "Could not finish setup");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <PaymentElement />
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-[#c9a227] to-[#e6c55a] text-[rgb(var(--brand-rgb))] hover:from-[#b8922a] hover:to-[#d4b54e] rounded-xl shadow-lg"
      >
        {submitting ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Saving...</>
        ) : (
          <>Activate Monthly Billing</>
        )}
      </Button>
      <p className="text-xs text-gray-500 text-center flex items-center justify-center gap-1">
        <ShieldCheck className="w-3.5 h-3.5" />
        Secured by Stripe. Your card is never stored on our servers.
      </p>
    </form>
  );
}

export default function SetupRecurring() {
  const [token, setToken] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(null);
  const [stripePromise, setStripePromise] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (!t) {
      setError("Missing setup token. Please use the link from your email.");
      setLoading(false);
      return;
    }
    setToken(t);
    api("setup_recurring_session", { token: t })
      .then((res) => {
        setInfo(res);
        if (res.publishableKey) {
          setStripePromise(loadStripe(res.publishableKey, res.stripeAccount ? { stripeAccount: res.stripeAccount } : undefined));
        } else {
          setError("Card setup is not available right now. Please contact the office.");
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
      <NerBadge fixed />
        <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <Card className="max-w-lg w-full bg-white rounded-2xl shadow-xl border-brand/10">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto bg-brand/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-9 h-9 text-brand" />
            </div>
            <h1 className="text-2xl font-semibold text-brand mb-2">You're all set!</h1>
            <p className="text-gray-600 mb-4">
              Your monthly contribution of <strong>{formatCurrency(info?.monthlyAmount)}</strong> is scheduled.
            </p>
            <div className="bg-brand/5 border border-brand/20 rounded-lg p-4 text-left text-sm space-y-1">
              <p><strong>Next charge:</strong> {done.nextChargeDate ? format(new Date(done.nextChargeDate), "MMMM d, yyyy") : "—"}</p>
              <p><strong>Remaining months:</strong> {done.remainingMonths}</p>
            </div>
            <p className="text-xs text-gray-500 mt-6">
              Thank you for your continued support of {info?.orgName || ""}.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <Card className="max-w-lg w-full bg-white rounded-2xl shadow-xl border-red-100">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-9 h-9 text-red-600" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to load setup</h1>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!stripePromise) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800">
          Stripe is not configured.
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <Card className="max-w-lg w-full bg-white rounded-2xl shadow-xl border-red-100">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertCircle className="w-9 h-9 text-red-600" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to load setup</h1>
            <p className="text-gray-600">Could not load setup session. The link may be invalid or expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const firstChargeDate = info?.firstChargeDate ? new Date(info.firstChargeDate) : null;
  const nextEstimatedDate = firstChargeDate ? new Date(firstChargeDate) : null;
  if (nextEstimatedDate) nextEstimatedDate.setMonth(nextEstimatedDate.getMonth() + 1);

  return (
    <div className="min-h-screen bg-canvas py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold text-brand mb-2">
            Set Up Monthly Billing
          </h1>
          <p className="text-gray-600">
            Thank you, {info.donorName || "friend"} — let's activate the rest of your pledge.
          </p>
        </div>

        <Card className="bg-white rounded-2xl shadow-xl border-brand/10 mb-6">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand mb-4">
              Your Pledge Summary
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-600">Monthly amount</span>
                <span className="font-semibold text-brand">{formatCurrency(info.monthlyAmount)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-600">Total months</span>
                <span className="font-semibold text-brand">{info.totalMonths}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-600">Already paid</span>
                <span className="font-semibold text-brand">1 month</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-600">Remaining</span>
                <span className="font-semibold text-brand">{info.remainingMonths} month{info.remainingMonths === 1 ? '' : 's'}</span>
              </div>
              {nextEstimatedDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600">First scheduled charge</span>
                  <span className="font-semibold text-brand">
                    {format(nextEstimatedDate, "MMMM d, yyyy")}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white rounded-2xl shadow-xl border-brand/10">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-brand mb-4">
              Payment Method
            </h2>
            <Elements
              stripe={stripePromise}
              options={{
                clientSecret: info.clientSecret,
                appearance: { theme: 'stripe', variables: { colorPrimary: '#059669' } },
              }}
            >
              <SetupForm
                sessionInfo={info}
                token={token}
                onComplete={(d) => setDone(d)}
              />
            </Elements>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-500 mt-6">
          {info?.orgName || ""}
        </p>
      </div>
    </div>
  );
}