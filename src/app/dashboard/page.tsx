import { redirect } from "next/navigation";

// The preset-based reel dashboard was removed along with that pipeline.
// Series are the single entry point now; /dashboard is kept as a stable
// destination because the landing page and existing bookmarks point at it.
export default function DashboardPage() {
  redirect("/dashboard/series");
}
