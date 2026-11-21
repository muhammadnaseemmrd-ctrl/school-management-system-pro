import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import SiteShell from '../components/site/SiteShell';
import Hero from '../components/site/Hero';
import ProblemSolution from '../components/site/ProblemSolution';
import Ecosystem from '../components/site/Ecosystem';
import SchoolYear from '../components/site/SchoolYear';
import Walkthrough from '../components/site/Walkthrough';
import Scenarios from '../components/site/Scenarios';
import LiveDemo from '../components/site/LiveDemo';
import Showcase from '../components/site/Showcase';
import Audiences from '../components/site/Audiences';
import { Pakistan, Trust, Proof, Pricing, DemoSection, Faq, FinalCta } from '../components/site/Sections';
import useReveal from '../utils/useReveal';

// The public home page. Each part lives in components/site, so the signed-in product is not touched.
export default function Landing() {
  const { hash } = useLocation();
  useReveal([]);
  // open on a section when the address has one (for example /#pricing from another page)
  useEffect(() => {
    if (!hash) return undefined;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    return () => clearTimeout(t);
  }, [hash]);
  return (
    <SiteShell>
      <Hero />
      <ProblemSolution />
      <Ecosystem />
      <SchoolYear />
      <Walkthrough />
      <Scenarios />
      <LiveDemo />
      <Showcase />
      <Audiences />
      <Pakistan />
      <Trust />
      <Proof />
      <Pricing />
      <DemoSection />
      <Faq />
      <FinalCta />
    </SiteShell>
  );
}
