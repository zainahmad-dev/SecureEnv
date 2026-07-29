import type { Metadata } from "next";
import { CenteredCard } from "@/components/shell/CenteredCard";

/**
 * The invite token sits in the URL path, which is the only way an emailed link
 * can carry it. no-referrer stops that token being handed to any third party
 * the page happens to link out to or load from, which would otherwise leak a
 * live credential into someone else's logs.
 */
export const metadata: Metadata = {
  referrer: "no-referrer",
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <CenteredCard>{children}</CenteredCard>;
}
