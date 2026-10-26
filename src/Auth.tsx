import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { GraduationCap, LockKeyhole, LogIn } from "lucide-react";
import { forgetRemoteWorkspace, RemoteError, request } from "./remote";

export async function logout() {
  await request("/session", { method: "DELETE" });
  forgetRemoteWorkspace();
  window.dispatchEvent(new Event("madar-session-expired"));
}
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "login" | "ready">("loading");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const expired = () => {
      forgetRemoteWorkspace();
      setState("login");
    };
    window.addEventListener("madar-session-expired", expired);
    request("/session")
      .then(() => setState("ready"))
      .catch((e) => {
        setState("login");
        if (!(e instanceof RemoteError && e.status === 401))
          setError(e.message);
      });
    return () => window.removeEventListener("madar-session-expired", expired);
  }, []);
  if (state === "ready") return children;
  return (
    <main className="auth-shell" dir="rtl">
      <section className="auth-card">
        <span className="brand-mark">
          <GraduationCap size={34} />
        </span>
        <span className="eyebrow">كلية الشريعة والأنظمة · جامعة الطائف</span>
        <h1>مدار</h1>
        <p>مساحة الدراسات العليا المشتركة</p>
        {state === "loading" ? (
          <p role="status">جارٍ التحقق من جلسة الدخول…</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request("/session", {
                  method: "POST",
                  body: JSON.stringify({ code }),
                });
                setCode("");
                setState("ready");
              } catch (e) {
                setError(e instanceof Error ? e.message : "تعذر تسجيل الدخول");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field">
              <span>
                <LockKeyhole size={15} /> رمز الدخول
              </span>
              <input
                aria-label="رمز الدخول"
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                maxLength={128}
                autoFocus
              />
            </label>
            <small>يمكن كتابة الأرقام بالعربية أو الإنجليزية.</small>
            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy || !code}>
              <LogIn size={17} />
              {busy ? "جارٍ الدخول…" : "دخول مدار"}
            </button>
            <small>
              للمخولين بالرمز المشترك: قراءة وتعديل بيانات جميع البرامج. تُحفظ
              التغييرات في مخزن الموقع وتظهر من أجهزتك الأخرى بعد تحديث المساحة.
            </small>
          </form>
        )}
      </section>
    </main>
  );
}
