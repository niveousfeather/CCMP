"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function SettingsForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    oldPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (form.newPassword.length < 8) {
      toast({ type: "error", message: "新密码至少需要 8 位" });
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      toast({ type: "error", message: "两次输入的新密码不一致" });
      return;
    }

    setLoading(true);
    const response = await fetch("/api/settings/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "修改失败" });
      return;
    }

    setForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
    toast({ type: "success", message: "密码已修改" });
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <Field label="旧密码">
        <Input type="password" value={form.oldPassword} onChange={(event) => setForm((current) => ({ ...current, oldPassword: event.target.value }))} autoComplete="current-password" />
      </Field>
      <Field label="新密码">
        <Input type="password" value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" />
      </Field>
      <Field label="确认新密码">
        <Input type="password" value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} autoComplete="new-password" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={loading}>
          {loading ? "保存中..." : "保存修改"}
        </Button>
      </div>
    </form>
  );
}
