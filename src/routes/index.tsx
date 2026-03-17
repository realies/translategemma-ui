import { createFileRoute } from "@tanstack/react-router";
import { TranslationPanel } from "~/components/TranslationPanel";
import { AuthProvider, useAuth } from "~/context/AuthContext";
import { LabelProvider } from "~/context/LabelContext";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [{ title: "TranslateGemma UI" }],
  }),
});

function HomePage() {
  return (
    <div className="min-h-screen px-5 py-10 dark:bg-zinc-950">
      <LabelProvider>
        <AuthProvider>
          <HomeContent />
        </AuthProvider>
      </LabelProvider>
    </div>
  );
}

function HomeContent() {
  const { authEnabled, status, userEmail, error, login, logout } = useAuth();

  if (authEnabled && status !== "authenticated") {
    const isLoading = status === "loading";

    return (
      <div className="mx-auto mt-20 w-full max-w-md rounded-2xl bg-white p-6 shadow-sm dark:bg-zinc-800">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Sign in required</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Use your organization&apos;s SSO account to continue.
        </p>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <button
          type="button"
          disabled={isLoading}
          onClick={() => {
            void login();
          }}
          className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isLoading ? "Checking session..." : "Login with SSO"}
        </button>
      </div>
    );
  }

  return (
    <>
      {authEnabled && (
        <div className="mx-auto mb-4 flex w-full max-w-5xl justify-end">
          <div className="inline-flex max-w-full items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm dark:bg-zinc-800">
            <span className="max-w-60 truncate text-sm text-zinc-600 dark:text-zinc-300">
              {userEmail ?? "Signed in"}
            </span>
            <button
              type="button"
              onClick={() => {
                void logout();
              }}
              className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              Logout
            </button>
          </div>
        </div>
      )}
      <TranslationPanel />
    </>
  );
}
