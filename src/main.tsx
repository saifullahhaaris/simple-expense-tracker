import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { SyncProvider } from "./context/SyncContext";
import { ThemeProvider } from "./context/ThemeContext";
import "./styles/legacy.css";
import "./styles/polish.css";

const queryClient = new QueryClient({
  defaultOptions: {
    // Data is local-first; the repo layer decides when to hit the network.
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: false, networkMode: "always" }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <SyncProvider>
              <App />
            </SyncProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(error => console.warn("Offline cache unavailable:", error));
  });
}
