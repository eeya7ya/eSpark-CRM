import { redirect } from "next/navigation";
import localFont from "next/font/local";
import { Cairo } from "next/font/google";
import { getSessionUser } from "@/lib/auth";
import LoginClient from "@/components/LoginClient";

export const dynamic = "force-dynamic";

// Exposed to the login CSS module as variables. Geist is the eSpark brand face
// and covers both the UI and the display/wordmark slot (the old build paired
// Inter with an italic Archivo wordmark; the eSpark mark is set in Geist, so
// one family now serves both). Cairo remains the Arabic face for the عربي
// toggle. Geist is self-hosted from `src/fonts`; Cairo is inlined at build
// time, so neither makes a runtime Google Fonts request.
const geistSans = localFont({
  src: [{ path: "../../fonts/GeistVF.woff2", style: "normal" }],
  variable: "--font-geist-sans",
  display: "swap",
});
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    // A must-change account has to set its own password before anything else.
    redirect(user.mustChangePassword ? "/change-password" : "/");
  }
  return <LoginClient className={`${geistSans.variable} ${cairo.variable}`} />;
}
