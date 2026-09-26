import { Calculator } from "@/components/marketing/calculator";
import { Hero } from "@/components/marketing/hero";
import { LeadForm } from "@/components/marketing/lead-form";
import { Faq, HowItWorks, Industries, Levers, Offerings, Pricing, Security } from "@/components/marketing/sections";
import { SiteFooter, SiteHeader } from "@/components/marketing/site-header";

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-plane">
      <SiteHeader />
      <main>
        <Hero />
        <Offerings />
        <Levers />
        <HowItWorks />
        <Calculator />
        <Industries />
        <Security />
        <Pricing />
        <Faq />
        <LeadForm />
      </main>
      <SiteFooter />
    </div>
  );
}
