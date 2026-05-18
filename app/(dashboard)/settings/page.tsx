import { ThemeSettings } from "@/components/theme/theme-settings";
import { SettingsForm } from "@/components/settings/settings-form";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <div>
        <p className="text-sm text-[var(--color-text-faint)]">个人设置</p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--color-text)]">账号与外观</h1>
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">
          管理当前账号密码，并设置适合你的界面显示方式。
        </p>
      </div>

      <Card className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-medium text-[var(--color-text)]">外观设置</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">选择深色、浅色，或跟随系统外观。</p>
        </div>
        <ThemeSettings />
      </Card>

      <Card className="p-6">
        <div className="mb-5">
          <h2 className="text-lg font-medium text-[var(--color-text)]">账号安全</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">修改当前登录账号的密码，修改后会保持当前登录状态。</p>
        </div>
        <SettingsForm />
      </Card>
    </div>
  );
}
