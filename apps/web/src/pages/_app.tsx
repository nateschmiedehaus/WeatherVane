import type { AppProps } from "next/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import "../styles/globals.css";
import { ThemeProvider } from "../lib/theme";
import { DemoProvider } from "../lib/demo";

function WeatherVaneApp({ Component, pageProps }: AppProps) {
  const [client] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <DemoProvider>
          <Component {...pageProps} />
        </DemoProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default WeatherVaneApp;
