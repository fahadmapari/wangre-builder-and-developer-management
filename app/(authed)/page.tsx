import { redirect } from "next/navigation"

export default function AuthedHome() {
  redirect("/projects")
}
