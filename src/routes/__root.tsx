import { createRootRoute, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
import "@fontsource-variable/inter/wght.css";
import "../styles.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "description", content: "Translate text between 55 languages using TranslateGemma" },
      { name: "theme-color", content: "#3b82f6" },
    ],
    links: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var m=window.matchMedia('(prefers-color-scheme: dark)');function u(){document.documentElement.classList.toggle('dark',m.matches)}u();m.addEventListener('change',u)})()`,
          }}
        />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
