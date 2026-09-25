import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { AdaptationSection } from "@/components/landing/AdaptationSection";
import { HookFramework } from "@/components/landing/HookFramework";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ExperienceSection } from "@/components/landing/ExperienceSection";
import { AuthoritySection } from "@/components/landing/AuthoritySection";
import { ServicesSection } from "@/components/landing/ServicesSection";
import { ProcessSection } from "@/components/landing/ProcessSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { ApplicationFormSection } from "@/components/landing/ApplicationFormSection";
import { Footer } from "@/components/landing/Footer";
import { AuthLinkForwarder } from "@/components/auth/AuthLinkForwarder";

export default function Home() {
  return (
    <>
      <AuthLinkForwarder />
      <Navbar />
      <main>
        <Hero />
        <ProblemSection />
        <AdaptationSection />
        <HookFramework />
        <HowItWorks />
        <ExperienceSection />
        <AuthoritySection />
        <ServicesSection />
        <ProcessSection />
        <CtaSection />
        <ApplicationFormSection />
      </main>
      <Footer />
    </>
  );
}
