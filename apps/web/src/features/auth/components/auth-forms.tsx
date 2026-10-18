"use client";

import { loginSchema, registerSchema } from "@devsync/shared";
import { Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { z } from "zod";

import { GitHubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isApiError } from "@/lib/api/http";

import { authApi, safeNext } from "../api";
import { useAuthProviders, useDemoLogin, useLogin, useRegister, useSession } from "../hooks";

type FieldErrors = Partial<Record<string, string>>;

const OAUTH_ERRORS: Record<string, string> = {
  github_denied: "GitHub sign-in was cancelled.",
  oauth_state_mismatch: "That sign-in link expired. Please try again.",
  github_disabled: "GitHub sign-in isn't available right now.",
};

function fieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return errors;
}

function serverErrors(error: unknown): FieldErrors {
  if (isApiError(error) && Array.isArray(error.details)) {
    const errors: FieldErrors = {};
    for (const d of error.details as { path: string; message: string }[])
      errors[d.path] ??= d.message;
    return errors;
  }
  return { form: error instanceof Error ? error.message : "Something went wrong" };
}

/** Sends a signed-in visitor on to `next`, including after a sign-in on this page. */
function useRedirectWhenSignedIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { data: user } = useSession();
  useEffect(() => {
    if (user) router.replace(next);
  }, [next, router, user]);
  return next;
}

function Field({
  id,
  label,
  error,
  ...props
}: { id: string; label: string; error: string | undefined } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function FormError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

function AlternativeSignIns({ next }: { next: string }) {
  const { data: providers } = useAuthProviders();
  const demo = useDemoLogin();
  if (!providers?.github && !providers?.demo) return null;

  return (
    <>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2">
        {providers.github && (
          <Button variant="outline" asChild>
            <a href={authApi.githubUrl(next)}>
              <GitHubIcon data-icon="inline-start" />
              Continue with GitHub
            </a>
          </Button>
        )}
        {providers.demo && (
          <Button variant="secondary" onClick={() => demo.mutate()} disabled={demo.isPending}>
            {demo.isPending ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            Try the demo, no sign-up
          </Button>
        )}
        <FormError message={demo.error?.message} />
      </div>
    </>
  );
}

function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="grid w-full max-w-sm gap-6 rounded-xl border bg-card p-6 shadow-sm sm:p-8">
      <div className="grid gap-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
      <p className="text-center text-sm text-muted-foreground">{footer}</p>
    </div>
  );
}

export function LoginForm() {
  const next = useRedirectWhenSignedIn();
  const oauthError = useSearchParams().get("error");
  const login = useLogin();
  const [errors, setErrors] = useState<FieldErrors>(
    oauthError ? { form: OAUTH_ERRORS[oauthError] ?? "Sign-in failed. Please try again." } : {},
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    login.mutate(parsed.data, { onError: (error) => setErrors(serverErrors(error)) });
  };

  return (
    <AuthCard
      title="Sign in to DevSync"
      description="Plan work on boards that stay in sync with GitHub."
      footer={
        <>
          New here?{" "}
          <Link
            href={`/register?next=${encodeURIComponent(next)}`}
            className="font-medium text-primary hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <FormError message={errors.form} />
        <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password}
        />
        <Button type="submit" disabled={login.isPending}>
          {login.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Sign in
        </Button>
      </form>
      <AlternativeSignIns next={next} />
    </AuthCard>
  );
}

export function RegisterForm() {
  const next = useRedirectWhenSignedIn();
  const register = useRegister();
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = registerSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    register.mutate(parsed.data, { onError: (error) => setErrors(serverErrors(error)) });
  };

  return (
    <AuthCard
      title="Create your account"
      description="You get a starter board right away."
      footer={
        <>
          Already have an account?{" "}
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <FormError message={errors.form} />
        <Field id="name" label="Name" autoComplete="name" error={errors.name} />
        <Field id="email" label="Email" type="email" autoComplete="email" error={errors.email} />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          placeholder="At least 10 characters"
        />
        <Button type="submit" disabled={register.isPending}>
          {register.isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          Create account
        </Button>
      </form>
      <AlternativeSignIns next={next} />
    </AuthCard>
  );
}
