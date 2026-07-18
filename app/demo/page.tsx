import { redirect } from "next/navigation";

export default function DemoEntry() {
  redirect("/recommendations?demo=1");
}
