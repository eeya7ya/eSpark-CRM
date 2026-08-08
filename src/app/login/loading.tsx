/**
 * Login route loading fallback.
 *
 * The login page awaits the session check before it can decide to render the
 * form or redirect an already-signed-in user. Something has to paint during
 * that gap or a reload flashes blank white.
 *
 * What it paints has to be the CURRENT design. This used to be a red radial
 * gradient over a blue-black one — the retired `--red*` accent and a palette
 * the login page no longer uses — so every load flashed the old brand for a
 * beat before the real page replaced it.
 *
 * Rather than a flat colour (which still visibly changes when the split page
 * arrives), this lays down the same geometry the page resolves to: charcoal
 * ground, paper panel on the trailing side, and the brand-blue hairline along
 * the 12° seam. Same tokens, same `--panelW` / `--slant` arithmetic as
 * login.module.css, so the hand-off is imperceptible rather than merely less
 * ugly. Deliberately no logo, wordmark or form — those move, and a skeleton
 * that shifts is worse than one that doesn't.
 *
 * Kept in sync by hand with `.auth` / `.authEdge` in login.module.css: this
 * file cannot import the CSS module and still inline the values, and the two
 * only have to agree on three numbers.
 */
export default function LoginLoading() {
  return (
    <div className="espark-login-loading" aria-hidden="true">
      <style>{`
        .espark-login-loading {
          position: fixed;
          inset: 0;
          overflow: hidden;
          /* --night, the same ground .root paints. */
          background: #1b1e20;
          --panelW: clamp(480px, 46vw, 700px);
          --slant: 21.26vh; /* 100vh × tan(12°) — the logo's italic angle */
        }
        .espark-login-loading::before,
        .espark-login-loading::after {
          content: "";
          position: absolute;
          top: 0;
          bottom: 0;
          inset-inline-end: 0;
          width: calc(var(--panelW) + var(--slant));
        }
        /* The brand-blue edge, under the paper panel — mirrors .authEdge. */
        .espark-login-loading::before {
          background: #5b7884;
          clip-path: polygon(
            calc(var(--slant) - 7px) 0,
            var(--slant) 0,
            7px 100%,
            0 100%
          );
        }
        /* The paper panel — mirrors .auth. */
        .espark-login-loading::after {
          background: #f4f0ec;
          clip-path: polygon(var(--slant) 0, 100% 0, 100% 100%, 0 100%);
        }
        /* Below 980px login.module.css stacks the panels and the page ground
           becomes paper, so the split would be wrong here — drop to the flat
           colour the stacked layout actually resolves to. */
        @media (max-width: 980px) {
          .espark-login-loading {
            background: #f4f0ec;
          }
          .espark-login-loading::before,
          .espark-login-loading::after {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
