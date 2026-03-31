import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Github } from "lucide-react";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-8 p-8">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Dashes</h1>
          <p className="text-center text-text-secondary">
            Build and ship web apps with AI agents
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="inline-flex h-12 items-center gap-3 rounded-lg bg-white px-6 text-base font-medium text-black transition-colors hover:bg-white/90"
          >
            <Github className="h-5 w-5" />
            Sign in with GitHub
          </button>
        </form>
      </div>
    </div>
  );
}
