import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function LoginPage() {
  return (
    <main className="subtle-grid grid min-h-screen place-items-center px-4 py-12">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <BrandLogo className="justify-center" />
          <h1 className="mt-6 text-3xl font-semibold text-[var(--color-text)]">登录 AI 创作平台</h1>
          <p className="mt-3 text-sm text-[var(--color-text-muted)]">
            仅限已有账号访问，账号由管理员统一创建。
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
