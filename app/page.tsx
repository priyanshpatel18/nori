import { BrandClosing } from "@/components/sections/brand-closing";
import { BrandCode } from "@/components/sections/brand-code";
import { BrandFaq } from "@/components/sections/brand-faq";
import { BrandMasthead } from "@/components/sections/brand-masthead";
import { BrandProduct } from "@/components/sections/brand-product";
import { BrandStats } from "@/components/sections/brand-stats";
import { SiteFooter } from "@/components/sections/site-footer";

export default function Home() {
  return (
    <div className="dark relative isolate flex min-h-screen flex-col bg-background text-foreground">
      <BrandMasthead />
      <BrandProduct />
      <BrandStats />
      <BrandCode />
      <BrandFaq />
      <BrandClosing />
      <SiteFooter />
    </div>
  );
}
