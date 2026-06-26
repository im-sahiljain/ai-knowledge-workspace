import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Knowledge Workspace",
  description: "AI-powered knowledge management platform with RAG",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className={`${inter.className} antialiased`}>
        <AuthProvider>
          {children}
          <Toaster
            richColors
            position="top-right"
            toastOptions={{
              duration: 5000,
            }}
          />
        </AuthProvider>
      </body>
    </html>
  );
}
