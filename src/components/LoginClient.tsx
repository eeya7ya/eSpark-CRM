"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import s from "./login.module.css";
import BrandLogo from "@/components/brand/BrandLogo";
import BrandGlyph from "@/components/brand/BrandGlyph";

/** EN / AR copy — mirrors the approved static design. */
const T = {
  en: {
    langBtn: "عربي",
    h1: "<em>Quotation</em> Designer,<br>Material Pricing<br>&amp; Lead Management",
    sub: "Design quotations, price materials and manage your leads — from the first RFQ to the delivered job, in one connected workspace.",
    f1: "RFQ → Quotation in minutes",
    f2: "Live material pricing & margins",
    f3: "Lead & pipeline management",
    f4: "Role-based & fully audited",
    s1: "Quotes issued",
    s2: "Active RFQs",
    s3: "Projects live",
    chip: "Sign in",
    welcome: "Welcome back",
    sub2: "Enter your credentials to continue.",
    wsL: "Workspace",
    wsP: "your-company",
    wsHint: "The workspace code your administrator gave you.",
    userL: "Username",
    userP: "your.username",
    passL: "Password",
    rem: "Remember me",
    forgot: "Forgot password?",
    forgotNote:
      "Passwords are managed by your administrator — ask them to reset yours.",
    signin: "Sign in",
    foot: "Protected workspace · role-based & audited.",
    t1: "Encrypted",
    t2: "Role-based",
    t3: "Audited",
  },
  ar: {
    langBtn: "EN",
    h1: "مصمّم <em>عروض الأسعار</em>،<br>تسعير المواد<br>وإدارة العملاء المحتملين",
    sub: "صمّم عروض الأسعار، سعّر المواد وتابع عملاءك المحتملين — من أول طلب عرض سعر حتى تسليم المشروع، في مساحة عمل واحدة متّصلة.",
    f1: "من الطلب إلى عرض السعر في دقائق",
    f2: "تسعير مباشر للمواد والهوامش",
    f3: "إدارة العملاء المحتملين والمبيعات",
    f4: "صلاحيات مدارة وتدقيق كامل",
    s1: "عرض سعر صادر",
    s2: "طلبات نشطة",
    s3: "مشروعًا قائمًا",
    chip: "تسجيل الدخول",
    welcome: "أهلاً بعودتك",
    sub2: "أدخل بياناتك للمتابعة.",
    wsL: "مساحة العمل",
    wsP: "اسم-شركتك",
    wsHint: "رمز مساحة العمل الذي زوّدك به المشرف.",
    userL: "اسم المستخدم",
    userP: "اسم.المستخدم",
    passL: "كلمة المرور",
    rem: "تذكرني",
    forgot: "نسيت كلمة المرور؟",
    forgotNote: "كلمات المرور يديرها المشرف — اطلب منه إعادة تعيين كلمتك.",
    signin: "تسجيل الدخول",
    foot: "مساحة عمل محمية · صلاحيات مدارة وتدقيق كامل.",
    t1: "مشفّرة",
    t2: "صلاحيات",
    t3: "مدقّقة",
  },
} as const;

type Lang = keyof typeof T;

/** Remembers the last workspace signed into, so returning staff never retype it. */
const WS_COOKIE = "espark_ws";

function rememberWorkspace(slug: string): void {
  // Readable by the server component that prefills this form, so it is not
  // httpOnly. It holds no secret — only which login form to show — and the
  // session cookie remains httpOnly as before.
  document.cookie = `${WS_COOKIE}=${encodeURIComponent(slug)}; path=/; max-age=${
    60 * 60 * 24 * 365
  }; samesite=lax`;
}

export default function LoginClient({
  className = "",
  showWorkspace = false,
  defaultWorkspace = "",
}: {
  className?: string;
  /** True when the deployment hosts multiple client workspaces. */
  showWorkspace?: boolean;
  defaultWorkspace?: string;
}) {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [workspace, setWorkspace] = useState(defaultWorkspace);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const t = T[lang];
  const dir = lang === "ar" ? "rtl" : "ltr";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          workspace: workspace.trim().toLowerCase(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Login failed");

      if (data.workspace) rememberWorkspace(String(data.workspace));

      // A must-change account goes straight to the change-password screen
      // (middleware would bounce it there anyway; this just skips the hop).
      if (data.user?.must_change_password) {
        router.push("/change-password");
        router.refresh();
        return;
      }
      // Otherwise honour a same-origin `?next=`, never an absolute URL.
      const nextParam = new URLSearchParams(window.location.search).get("next");
      const dest =
        nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
          ? nextParam
          : "/";
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className={`${s.root} ${className}`} data-lang={lang} dir={dir} lang={lang}>
      {/* ══ brand side ══ */}
      <aside className={s.brand}>
        <div className={s.brandTop}>
          <BrandLogo
            tone="current"
            glyphClassName={s.logo}
            wordmarkClassName="text-[34px]"
          />
          <button
            className={s.langBtn}
            type="button"
            onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
          >
            {t.langBtn}
          </button>
        </div>

        <div className={s.brandMain}>
          <h1
            className={`${s.h1} ${s.disp}`}
            dangerouslySetInnerHTML={{ __html: t.h1 }}
          />
          <p className={s.sub}>{t.sub}</p>

          <div className={s.features}>
            <div className={s.feature}>
              <svg viewBox="0 0 24 24">
                <path d="M13 3H6v18h12V8z" />
                <path d="M13 3v5h5" />
                <path d="M9 13h6M9 17h6" />
              </svg>
              <span>{t.f1}</span>
            </div>
            <div className={s.feature}>
              <svg viewBox="0 0 24 24">
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M15 7h6v6" />
              </svg>
              <span>{t.f2}</span>
            </div>
            <div className={s.feature}>
              <svg viewBox="0 0 24 24">
                <path d="M9 6h11M9 12h11M9 18h11" />
                <path d="M4 6h.01M4 12h.01M4 18h.01" />
              </svg>
              <span>{t.f3}</span>
            </div>
            <div className={s.feature}>
              <svg viewBox="0 0 24 24">
                <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span>{t.f4}</span>
            </div>
          </div>

          <div className={s.stats}>
            <div className={s.stat}>
              <b>1.2k+</b>
              <span>{t.s1}</span>
            </div>
            <div className={s.stat}>
              <b>32</b>
              <span>{t.s2}</span>
            </div>
            <div className={s.stat}>
              <b>24</b>
              <span>{t.s3}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Brand mark as a full-height watermark straddling the 12° cut.
          It is drawn TWICE at identical coordinates — this copy on the dark
          panel, a second one inside the auth panel below — because a single
          tint cannot read on both backgrounds at watermark opacity. Each copy
          is clipped to its own side (the auth panel's clip-path does the
          second one for free), so together they read as one continuous mark
          that changes colour where it crosses the seam. */}
      <BrandGlyph className={s.ghost} tone="current" title="" />

      {/* ══ auth side — cut at the wordmark's 12° ══ */}
      <div className={s.authEdge} aria-hidden="true" />
      <main className={s.auth}>
        {/* The light-side half of the watermark. It lives inside `.auth` so
            that panel's own clip-path trims it to the seam, and shares the
            dark copy's coordinates — both anchor to the viewport's right
            edge and to its vertical centre, so the two halves line up. */}
        <BrandGlyph className={s.ghostLight} tone="current" title="" />
        <form className={s.card} onSubmit={onSubmit} noValidate>
          <div>
            <span className={s.chip}>{t.chip}</span>
            <h2 className={`${s.h2} ${s.disp}`}>{t.welcome}</h2>
            <p className={s.sub2}>{t.sub2}</p>
          </div>

          {error && (
            <div className={s.error} role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className={s.foot} style={{ marginTop: 0, marginBottom: 14, textAlign: "start" }}>
              {notice}
            </div>
          )}

          {showWorkspace && (
            <div className={s.fld}>
              <label htmlFor="w">{t.wsL}</label>
              <div className={s.in}>
                <svg viewBox="0 0 24 24">
                  <path d="M3 21h18" />
                  <path d="M5 21V7l7-4 7 4v14" />
                  <path d="M10 21v-6h4v6" />
                </svg>
                <input
                  id="w"
                  name="workspace"
                  type="text"
                  autoComplete="organization"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t.wsP}
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  required
                />
              </div>
              <div className={s.foot} style={{ marginTop: 6, textAlign: "start" }}>
                {t.wsHint}
              </div>
            </div>
          )}

          <div className={s.fld}>
            <label htmlFor="u">{t.userL}</label>
            <div className={s.in}>
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
              <input
                id="u"
                name="username"
                type="text"
                autoComplete="username"
                placeholder={t.userP}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          </div>

          <div className={s.fld}>
            <label htmlFor="p">{t.passL}</label>
            <div className={`${s.in} ${s.hasEye}`}>
              <svg viewBox="0 0 24 24">
                <rect x="4" y="10" width="16" height="10" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
              <input
                id="p"
                name="password"
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                className={s.eye}
                type="button"
                aria-label={showPw ? "Hide password" : "Show password"}
                aria-pressed={showPw}
                onClick={() => setShowPw((v) => !v)}
              >
                <svg viewBox="0 0 24 24">
                  <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
                  <circle cx="12" cy="12" r="2.6" />
                </svg>
              </button>
            </div>
          </div>

          <div className={s.row}>
            <label className={s.remember}>
              <input type="checkbox" name="remember" />
              <span>{t.rem}</span>
            </label>
            <button
              type="button"
              className={s.forgot}
              onClick={() => {
                setError(null);
                setNotice(t.forgotNote);
              }}
            >
              {t.forgot}
            </button>
          </div>

          <button className={s.btn} type="submit" disabled={loading}>
            {loading ? (
              <span className={s.spin} aria-hidden="true" />
            ) : (
              <>
                <span>{t.signin}</span>
                <svg
                  className={s.arrow}
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </>
            )}
          </button>

          <div>
            <p className={s.foot}>{t.foot}</p>
            <div className={s.trust}>
              <span>
                <svg viewBox="0 0 24 24">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <i style={{ fontStyle: "normal" }}>{t.t1}</i>
              </span>
              <span>
                <svg viewBox="0 0 24 24">
                  <circle cx="9" cy="8" r="3.2" />
                  <path d="M3 20c1.2-3.2 3.5-4.8 6-4.8s4.8 1.6 6 4.8" />
                  <path d="M16 4a3.2 3.2 0 0 1 0 8M18.5 15.5c1.4.8 2.4 2.3 3 4.5" />
                </svg>
                <i style={{ fontStyle: "normal" }}>{t.t2}</i>
              </span>
              <span>
                <svg viewBox="0 0 24 24">
                  <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                <i style={{ fontStyle: "normal" }}>{t.t3}</i>
              </span>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
