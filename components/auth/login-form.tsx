"use client";

import { ArrowRight } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ username: "", password: "" });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json().catch(() => ({}));

    setLoading(false);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "登录失败" });
      return;
    }

    toast({ type: "success", message: "登录成功" });
    router.push(searchParams.get("next") || "/workspace");
    router.refresh();
  }

  return (
    <Card className="p-6">
      <form className="grid gap-5" onSubmit={onSubmit}>
        <Field label="账号">
          <Input
            value={form.username}
            onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
            placeholder="请输入用户名"
            autoComplete="username"
          />
        </Field>
        <Field label="密码">
          <Input
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="请输入密码"
            type="password"
            autoComplete="current-password"
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={loading}>
          {loading ? "登录中..." : "进入工作台"}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
