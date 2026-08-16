import SmoothScroll from "@/components/SmoothScroll";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ValueProps from "@/components/ValueProps";
import PriceList from "@/components/PriceList";
import HowWeGroom from "@/components/HowWeGroom";
import Explainers from "@/components/Explainers";
import Testimonials from "@/components/Testimonials";
import Booking from "@/components/Booking";
import Footer from "@/components/Footer";
import LocalBusinessJsonLd from "@/components/LocalBusinessJsonLd";
import { salonNow } from "@/lib/time";
import { getPricingView } from "@/lib/pricing";

// The salon's "today" changes at midnight in Colombo, not at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  // One read, shared by the price cards and the booking form, so the site can't
  // advertise one price and book another.
  const pricing = await getPricingView();

  return (
    <>
      <LocalBusinessJsonLd />
      <SmoothScroll />
      <Navbar />
      <main>
        <Hero />
        <ValueProps />
        <PriceList
          packages={pricing.packages}
          spa={pricing.spa}
          extras={pricing.extras}
        />
        <HowWeGroom />
        <Explainers />
        <Testimonials />
        <Booking
          todayISO={salonNow().dateISO}
          options={pricing.bookingOptions}
          services={pricing.addOns}
        />
      </main>
      <Footer />
    </>
  );
}
