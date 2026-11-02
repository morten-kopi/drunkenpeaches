"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import {
  loginAction,
  sendSignInCodeAction,
  verifySignInCodeAction,
  type FormState,
  type SendCodeState,
} from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormError } from "@/components/form-error";

type Method = "code" | "password";

// The device remembers how its member last signed in and opens on that.
const METHOD_KEY = "signin-method";
const RESEND_AFTER_S = 60;

function savedMethod(): Method {
  try {
    return localStorage.getItem(METHOD_KEY) === "password" ? "password" : "code";
  } catch {
    return "code";
  }
}

function saveMethod(method: Method) {
  try {
    localStorage.setItem(METHOD_KEY, method);
  } catch {
    // Private browsing: the form opens on the code next time.
  }
}

const noSubscription = () => () => {};

export function LoginForm({ next }: { next?: string }) {
  const remembered = useSyncExternalStore<Method>(
    noSubscription,
    savedMethod,
    () => "code"
  );
  const [chosen, setChosen] = useState<Method | null>(null);
  const method = chosen ?? remembered;
  const [email, setEmail] = useState("");

  const [sendState, sendAction, sending] = useActionState<SendCodeState, FormData>(
    sendSignInCodeAction,
    {}
  );
  // Each send starts a fresh code step with its own countdown.
  const [sends, setSends] = useState(0);
  const [sentAt, setSentAt] = useState(0);
  const [leftCodeStep, setLeftCodeStep] = useState<SendCodeState | null>(null);
  const codeStep =
    method === "code" && sendState.sent && sendState !== leftCodeStep;

  function onSend() {
    saveMethod("code");
    setSentAt(Date.now());
    setSends((n) => n + 1);
  }

  function switchTo(m: Method) {
    setChosen(m);
    setLeftCodeStep(sendState);
  }

  if (codeStep) {
    return (
      <CodeStep
        key={sends}
        email={sendState.email ?? email}
        next={next}
        sentAt={sentAt}
        sendAction={sendAction}
        sending={sending}
        onSend={onSend}
        onChangeEmail={() => setLeftCodeStep(sendState)}
        onUsePassword={() => switchTo("password")}
      />
    );
  }

  if (method === "password") {
    return (
      <PasswordStep
        email={email}
        setEmail={setEmail}
        next={next}
        onUseCode={() => switchTo("code")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <form action={sendAction} onSubmit={onSend} className="space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <FormError message={sendState.error} />
        <Button type="submit" className="w-full" loading={sending}>
          Email me a sign-in code
        </Button>
      </form>
      <SwitchLink onClick={() => switchTo("password")}>
        Sign in with a password instead
      </SwitchLink>
    </div>
  );
}

function CodeStep({
  email,
  next,
  sentAt,
  sendAction,
  sending,
  onSend,
  onChangeEmail,
  onUsePassword,
}: {
  email: string;
  next?: string;
  sentAt: number;
  sendAction: (formData: FormData) => void;
  sending: boolean;
  onSend: () => void;
  onChangeEmail: () => void;
  onUsePassword: () => void;
}) {
  const [state, verifyAction, verifying] = useActionState<FormState, FormData>(
    verifySignInCodeAction,
    {}
  );
  const [now, setNow] = useState(sentAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - sentAt) / 1000));

  return (
    <div className="space-y-6">
      <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
        If <span className="font-medium text-foreground">{email}</span>{" "}
        is a member&apos;s email, a code is on its way. Enter it below, or use
        the Sign in button in the email.
      </p>
      <form action={verifyAction} className="space-y-4">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={12}
            autoFocus
            required
            className="text-center font-mono text-lg tracking-[0.3em]"
          />
        </div>
        <FormError message={state.error} />
        <Button type="submit" className="w-full" loading={verifying}>
          Sign in
        </Button>
      </form>
      <div className="space-y-2">
        <form action={sendAction} onSubmit={onSend}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="next" value={next ?? ""} />
          <SwitchLink type="submit" disabled={wait > 0 || sending}>
            {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
          </SwitchLink>
        </form>
        <SwitchLink onClick={onChangeEmail}>Use a different email</SwitchLink>
        <SwitchLink onClick={onUsePassword}>
          Sign in with a password instead
        </SwitchLink>
      </div>
    </div>
  );
}

function PasswordStep({
  email,
  setEmail,
  next,
  onUseCode,
}: {
  email: string;
  setEmail: (email: string) => void;
  next?: string;
  onUseCode: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    loginAction,
    {}
  );

  return (
    <div className="space-y-6">
      <form
        action={formAction}
        onSubmit={() => saveMethod("password")}
        className="space-y-4"
      >
        <input type="hidden" name="next" value={next ?? ""} />
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FormError message={state.error} />
        <Button type="submit" className="w-full" loading={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <div className="space-y-2">
        <SwitchLink onClick={onUseCode}>Email me a sign-in code instead</SwitchLink>
        <p className="text-sm">
          <Link
            href="/auth/forgot"
            className="text-muted-foreground underline underline-offset-4 hover:text-primary"
          >
            Forgot your password?
          </Link>
        </p>
      </div>
    </div>
  );
}

function SwitchLink({
  children,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <p className="text-sm">
      <button
        type={type}
        className="text-muted-foreground underline underline-offset-4 hover:text-primary disabled:no-underline disabled:opacity-60 disabled:hover:text-muted-foreground"
        {...props}
      >
        {children}
      </button>
    </p>
  );
}
