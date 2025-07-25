import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";
import ModalSelector from "@/components/modal/modal-selector";
import { ModalProvider } from "./context/ModalContext";
import { PromptsProvider } from "./context/PromptContext";
import { SystemInstructionProvider } from "./context/SystemInstructionContext";

const montserrat = Montserrat({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <ModalProvider>
        <PromptsProvider>
          <SystemInstructionProvider>
            <ModalSelector></ModalSelector>
            <body className={montserrat.className}>{children}</body>
          </SystemInstructionProvider>
        </PromptsProvider>
      </ModalProvider>
    </html>
  );
}
