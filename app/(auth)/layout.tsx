import { CenteredCard } from "@/components/shell/CenteredCard";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <CenteredCard>{children}</CenteredCard>;
}
