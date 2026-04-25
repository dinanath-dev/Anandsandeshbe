import ArchedOrgTitle from './ArchedOrgTitle.jsx';
import anandpurLogo from '../assets/Shri_AnandpurDham_Logo.png';

export default function DonationLayout({ subtitle, children }) {
  return (
    <div className="donation-page min-h-screen text-ink">
      <header className="donation-header relative z-[1] overflow-hidden px-4 pb-3 pt-5 text-center sm:pb-4 sm:pt-6">
        <p className="donation-mantra relative z-[2] mx-auto flex max-w-4xl items-center justify-center gap-3 font-devanagari text-xl font-bold sm:gap-4 sm:text-2xl md:text-3xl">
          <span className="donation-mantra-flor select-none text-lg sm:text-xl md:text-2xl" aria-hidden>
            ✿
          </span>
          <span>श्रीसद्गुरुदेवाय नमः</span>
          <span className="donation-mantra-flor select-none text-lg sm:text-xl md:text-2xl" aria-hidden>
            ✿
          </span>
        </p>

        <div className="relative z-[2] mx-auto w-full max-w-[min(100%,54rem)] px-0 leading-none sm:max-w-[min(100%,68rem)] lg:max-w-[min(100%,76rem)]">
          <h1 className="sr-only">Shri Paramhans Advait Mat</h1>
          <ArchedOrgTitle />
        </div>

        <figure className="donation-seal relative z-[2] mx-auto -mt-1 flex justify-center sm:-mt-0.5">
          <img
            src={anandpurLogo}
            alt="Shri Anandpur Dham — Shri Paramhans Advait Mat"
            className="h-auto w-[min(88vw,10.5rem)] object-contain drop-shadow-[0_6px_20px_rgba(15,80,40,0.2)] sm:w-[min(88vw,12.5rem)]"
            width={400}
            height={400}
            decoding="async"
          />
        </figure>

        {subtitle ? (
          <h2 className="donation-subtitle relative z-[2] mx-auto mt-2 max-w-xl px-2 text-base font-bold text-ink/95 sm:mt-3 sm:text-xl">
            {subtitle}
          </h2>
        ) : null}
      </header>

      <div className="relative z-[1] mx-auto w-full max-w-[min(100%,52rem)] px-3 pb-16 pt-1 sm:max-w-[min(100%,64rem)] sm:px-8 sm:pt-2 lg:max-w-[min(100%,72rem)]">
        {children}
      </div>
    </div>
  );
}
