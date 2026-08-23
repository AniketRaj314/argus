import type { Metadata } from "next";
import { connection } from "next/server";
import { ArgusApp } from "../components/ArgusApp";

export const metadata: Metadata = {
  title: { absolute: "ARGUS: API usage intelligence" },
  description: "Sign in to the secure ARGUS API usage dashboard.",
  robots: { index: false, follow: false },
};

export default async function ApplicationPage() {
  await connection();
  return <ArgusApp />;
}
