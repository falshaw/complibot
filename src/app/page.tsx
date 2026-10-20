import { redirect } from "next/navigation";

/** No landing page: signed-in users land on the dashboard, others on /login. */
export default function Home() {
  redirect("/dashboard");
}
