"use client";

import Papa from "papaparse";
import {
  Box,
  Download,
  FileSpreadsheet,
  KeyRound,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  WalletCards
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FileUpload } from "@/components/ui/file-upload";
import { Field, Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

type User = {
  id: string;
  username: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

type UserRole = "ADMIN" | "TEACHER" | "STUDENT";

type RoleQuota = {
  role: UserRole;
  imageDailyLimit: number;
  videoDailyLimit: number;
  model3DDailyLimit: number;
};

type ImportFailure = {
  username?: string;
  row: number;
  reason: string;
};

type ImportPreviewRow = {
  row: number;
  username: string;
  role: string;
  password: string;
  status: "valid" | "invalid";
  reason?: string;
};

type ImportResult = {
  totalCount: number;
  successCount: number;
  failedCount: number;
  duplicateUsernames: string[];
  failed: ImportFailure[];
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const REQUIRED_HEADERS = ["username", "role", "password"];
const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "ADMIN", label: "管理员" },
  { value: "TEACHER", label: "教师" },
  { value: "STUDENT", label: "学生" }
];

function getRoleLabel(role: string) {
  return roleOptions.find((item) => item.value === role)?.label || role;
}

export function UsersClient() {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadUsers(options?: { silent?: boolean }) {
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize)
    });
    if (search.trim()) {
      params.set("search", search.trim());
    }
    if (role !== "ALL") {
      params.set("role", role);
    }

    const response = await fetch(`/api/users?${params.toString()}`);
    const data = await response.json().catch(() => ({}));

    setLoading(false);
    setRefreshing(false);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "用户列表加载失败" });
      return;
    }

    setUsers(data.users || []);
    setTotal(data.total || 0);
    setTotalPages(data.totalPages || 1);
    setSelectedIds([]);
  }

  useEffect(() => {
    loadUsers();
  }, [page, pageSize, role]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      loadUsers();
    }, 280);

    return () => window.clearTimeout(timer);
  }, [search]);

  const currentPageIds = users.map((user) => user.id);
  const isAllCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.includes(id));

  function toggleCurrentPage(checked: boolean) {
    if (checked) {
      setSelectedIds(Array.from(new Set([...selectedIds, ...currentPageIds])));
    } else {
      setSelectedIds(selectedIds.filter((id) => !currentPageIds.includes(id)));
    }
  }

  function toggleUser(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? Array.from(new Set([...current, id])) : current.filter((item) => item !== id)
    );
  }

  async function deleteUsers(ids: string[]) {
    setDeleting(true);
    const response = await fetch("/api/users/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids })
    });
    const data = await response.json().catch(() => ({}));
    setDeleting(false);
    setDeleteTarget(null);
    setBulkDeleteOpen(false);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "删除失败" });
      return;
    }

    const failedCount = data.failed?.length || 0;
    if (failedCount) {
      toast({ type: "error", message: `已删除 ${data.deletedCount} 个，${failedCount} 个未删除` });
    } else {
      toast({ type: "success", message: `已删除 ${data.deletedCount} 个用户` });
    }
    loadUsers({ silent: true });
  }

  async function updateUserRole(user: User, nextRole: UserRole) {
    if (user.role === nextRole) return;
    const response = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast({ type: "error", message: data.message || "角色修改失败" });
      return;
    }

    toast({ type: "success", message: "用户角色已更新" });
    loadUsers({ silent: true });
  }

  const hasFilter = Boolean(search.trim() || role !== "ALL");
  const adminCountOnPage = useMemo(() => users.filter((user) => user.role === "ADMIN").length, [users]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="text-sm text-white/[0.42]">管理员</p>
          <h1 className="mt-2 text-3xl font-semibold">用户管理</h1>
          <p className="mt-3 text-sm text-white/[0.52]">搜索、导入、批量维护用户，并保持账号权限边界清晰。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" />
            批量导入
          </Button>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            添加用户
          </Button>
        </div>
      </div>

      <AdminTripoBalanceCard />
      <CompactRoleQuotaCard />

      <Card className="overflow-hidden p-0">
        <div className="grid gap-4 border-b border-white/10 p-5">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <h2 className="text-lg font-medium">账号列表</h2>
              <p className="mt-1 text-sm text-white/[0.42]">
                共 {total} 个账号，当前页管理员 {adminCountOnPage} 个，默认按创建时间倒序排列
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => loadUsers({ silent: true })} aria-label="刷新用户" disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_180px_150px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/[0.36]" />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索用户名..."
              />
            </div>
            <select
              className="h-10 rounded-lg border border-white/10 bg-[#161618] px-3 text-sm text-white outline-none focus:border-white/[0.45]"
              value={role}
              onChange={(event) => {
                setPage(1);
                setRole(event.target.value);
              }}
            >
              <option value="ALL">全部角色</option>
              {roleOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-lg border border-white/10 bg-[#161618] px-3 text-sm text-white outline-none focus:border-white/[0.45]"
              value={pageSize}
              onChange={(event) => {
                setPage(1);
                setPageSize(Number(event.target.value));
              }}
            >
              <option value={10}>每页 10 条</option>
              <option value={20}>每页 20 条</option>
              <option value={50}>每页 50 条</option>
            </select>
          </div>

          {selectedIds.length ? (
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3 md:flex-row md:items-center">
              <p className="text-sm text-white/[0.72]">已选择当前筛选结果中的 {selectedIds.length} 个用户</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>取消选择</Button>
                <Button variant="danger" size="sm" onClick={() => setBulkDeleteOpen(true)}>
                  <Trash2 className="h-4 w-4" />
                  批量删除
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {loading ? (
          <TableSkeleton rows={7} columns={5} />
        ) : users.length ? (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead className="text-xs text-white/[0.42]">
                  <tr className="border-b border-white/10">
                    <th className="w-12 px-5 py-3 font-medium">
                      <Checkbox
                        checked={isAllCurrentPageSelected}
                        onChange={(event) => toggleCurrentPage(event.target.checked)}
                        aria-label="全选当前页"
                      />
                    </th>
                    <th className="px-5 py-3 font-medium">用户名</th>
                    <th className="px-5 py-3 font-medium">角色</th>
                    <th className="px-5 py-3 font-medium">创建时间</th>
                    <th className="px-5 py-3 font-medium">更新时间</th>
                    <th className="px-5 py-3 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-white/[0.06] transition hover:bg-white/[0.035]">
                      <td className="px-5 py-4">
                        <Checkbox
                          checked={selectedIds.includes(user.id)}
                          onChange={(event) => toggleUser(user.id, event.target.checked)}
                          aria-label={`选择 ${user.username}`}
                        />
                      </td>
                      <td className="px-5 py-4 text-white">{user.username}</td>
                      <td className="px-5 py-4">
                        <select
                          className="h-9 rounded-lg border border-white/10 bg-[#161618] px-2 text-sm text-white outline-none focus:border-white/[0.45]"
                          value={user.role}
                          onChange={(event) => updateUserRole(user, event.target.value as UserRole)}
                        >
                          {roleOptions.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-5 py-4 text-white/[0.48]">{new Date(user.created_at).toLocaleString("zh-CN")}</td>
                      <td className="px-5 py-4 text-white/[0.48]">{new Date(user.updated_at).toLocaleString("zh-CN")}</td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setResetUser(user)}>
                            <KeyRound className="h-4 w-4" />
                            重置
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setDeleteTarget(user)}>
                            <Trash2 className="h-4 w-4" />
                            删除
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 p-4 md:hidden">
              {users.map((user) => (
                <div key={user.id} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedIds.includes(user.id)}
                        onChange={(event) => toggleUser(user.id, event.target.checked)}
                        aria-label={`选择 ${user.username}`}
                      />
                      <span className="font-medium">{user.username}</span>
                    </div>
                    <Badge>{getRoleLabel(user.role)}</Badge>
                  </div>
                  <p className="text-xs text-white/[0.42]">创建于 {new Date(user.created_at).toLocaleString("zh-CN")}</p>
                  <div className="mt-4 flex gap-2">
                    <Button className="flex-1" variant="secondary" size="sm" onClick={() => setResetUser(user)}>重置</Button>
                    <Button className="flex-1" variant="danger" size="sm" onClick={() => setDeleteTarget(user)}>删除</Button>
                  </div>
                </div>
              ))}
            </div>

            <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onPageChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={FileSpreadsheet}
            title={hasFilter ? "没有匹配的用户" : "暂无用户"}
            description={hasFilter ? "尝试调整关键词或角色筛选。" : "可以添加单个用户，或通过 CSV / Excel 批量导入。"}
            action={!hasFilter ? <Button variant="primary" onClick={() => setCreateOpen(true)}>添加用户</Button> : undefined}
          />
        )}
      </Card>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onDone={() => loadUsers({ silent: true })} />
      <BulkImportDialog open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={() => loadUsers({ silent: true })} />
      <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除用户"
        description={`确认删除用户 ${deleteTarget?.username || ""}？该操作不可撤销。`}
        confirmText="确认删除"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteUsers([deleteTarget.id])}
      />
      <ConfirmDialog
        open={bulkDeleteOpen}
        title="批量删除用户"
        description={`确认删除选中的 ${selectedIds.length} 个用户？该操作不可撤销。系统会自动阻止删除当前账号和最后一个管理员。`}
        confirmText="批量删除"
        loading={deleting}
        onCancel={() => setBulkDeleteOpen(false)}
        onConfirm={() => deleteUsers(selectedIds)}
      />
    </div>
  );
}

type TripoWalletSummary = {
  balance: number | null;
  frozen: number | null;
  credits: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function pickNumber(records: Array<Record<string, unknown> | null>, keys: string[]) {
  for (const record of records) {
    if (!record) continue;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string") {
        const normalized = Number(value.replace(/,/g, ""));
        if (Number.isFinite(normalized)) return normalized;
      }
    }
  }
  return null;
}

function summarizeTripoWallet(payload: unknown): TripoWalletSummary {
  const root = asRecord(payload);
  const wallet = asRecord(root?.wallet) || root;
  const data = asRecord(wallet?.data) || wallet;
  const records = [data, wallet, root];

  return {
    balance: pickNumber(records, ["balance", "remain_amount", "remaining_balance", "available_balance"]),
    frozen: pickNumber(records, ["frozen", "frozen_balance", "locked_balance"]),
    credits: pickNumber(records, ["credits", "remain_quota", "quota", "available_quota"])
  };
}

function formatWalletValue(value: number | null, loading: boolean) {
  if (loading) return "查询中...";
  if (value === null) return "-";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 4 });
}

function AdminTripoBalanceCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [wallet, setWallet] = useState<TripoWalletSummary | null>(null);
  const [error, setError] = useState("");

  async function loadBalance() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/model3d/wallet", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      const message = data.message || "Tripo 钱包余额查询失败，请稍后重试。";
      setError(message);
      toast({ type: "error", message });
      return;
    }

    setWallet(summarizeTripoWallet(data));
    toast({ type: "success", message: "Tripo 钱包余额已更新。" });
  }

  useEffect(() => {
    loadBalance();
  }, []);

  return (
    <Card className="p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-blue-600">
            <WalletCards className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--color-text)]">Tripo 钱包余额</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              连接 Tripo 官方钱包接口，显示当前 3D 生成账户的可用余额与冻结金额。
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={loadBalance} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新余额
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4 text-sm text-[var(--color-text-muted)]">
          {error}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-text-faint)]">可用余额 balance</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {formatWalletValue(wallet?.balance ?? null, loading)}
            </p>
          </div>
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-text-faint)]">冻结金额 frozen</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {formatWalletValue(wallet?.frozen ?? null, loading)}
            </p>
          </div>
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-text-faint)]">可用额度 credits</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {formatWalletValue(wallet?.credits ?? null, loading)}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function CompactRoleQuotaCard() {
  const { toast } = useToast();
  const [quotas, setQuotas] = useState<RoleQuota[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingRole, setSavingRole] = useState<UserRole | null>(null);

  async function loadQuotas() {
    setLoading(true);
    const response = await fetch("/api/admin/role-quotas", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "角色额度加载失败" });
      return;
    }

    setQuotas(data.quotas || []);
  }

  useEffect(() => {
    loadQuotas();
  }, []);

  function updateLocal(role: UserRole, field: "imageDailyLimit" | "videoDailyLimit" | "model3DDailyLimit", value: string) {
    const number = Math.max(Number(value || 0), 0);
    setQuotas((current) =>
      current.map((item) => (item.role === role ? { ...item, [field]: Number.isFinite(number) ? Math.floor(number) : 0 } : item))
    );
  }

  async function saveQuota(quota: RoleQuota) {
    setSavingRole(quota.role);
    const response = await fetch(`/api/admin/role-quotas/${quota.role}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDailyLimit: quota.imageDailyLimit,
        videoDailyLimit: quota.videoDailyLimit,
        model3DDailyLimit: quota.model3DDailyLimit
      })
    });
    const data = await response.json().catch(() => ({}));
    setSavingRole(null);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "角色额度保存失败" });
      return;
    }

    toast({ type: "success", message: `${getRoleLabel(quota.role)}额度已保存` });
    loadQuotas();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">角色每日配额</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">统一控制图片、视频与 3D 生成的每日提交次数。</p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadQuotas} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新配额
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)]">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="text-xs text-[var(--color-text-faint)]">
            <tr className="border-b border-[color:var(--color-border)]">
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-3 py-3 font-medium">图片生成次数</th>
              <th className="px-3 py-3 font-medium">视频生成次数</th>
              <th className="px-3 py-3 font-medium">3D生成次数</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {quotas.map((quota) => (
              <tr key={quota.role} className="border-b border-[color:var(--color-border)] last:border-b-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-panel)] text-blue-600">
                      <Box className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="font-medium text-[var(--color-text)]">{getRoleLabel(quota.role)}</p>
                      <p className="text-xs text-[var(--color-text-faint)]">{quota.role.toLowerCase()}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Input
                    className="h-9"
                    type="number"
                    min={0}
                    value={quota.imageDailyLimit}
                    onChange={(event) => updateLocal(quota.role, "imageDailyLimit", event.target.value)}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    className="h-9"
                    type="number"
                    min={0}
                    value={quota.videoDailyLimit}
                    onChange={(event) => updateLocal(quota.role, "videoDailyLimit", event.target.value)}
                  />
                </td>
                <td className="px-3 py-3">
                  <Input
                    className="h-9"
                    type="number"
                    min={0}
                    value={quota.model3DDailyLimit}
                    onChange={(event) => updateLocal(quota.role, "model3DDailyLimit", event.target.value)}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button type="button" variant="primary" size="sm" disabled={savingRole === quota.role} onClick={() => saveQuota(quota)}>
                    {savingRole === quota.role ? "保存中..." : "保存"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminBalanceCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<{ remain_amount: number; remain_quota: number } | null>(null);
  const [error, setError] = useState("");

  async function loadBalance() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/balance");
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      const message = data.message || "余额查询失败，请稍后重试。";
      setError(message);
      toast({ type: "error", message });
      return;
    }

    setBalance({
      remain_amount: data.remain_amount,
      remain_quota: data.remain_quota
    });
    toast({ type: "success", message: "账户余额已更新。" });
  }

  useEffect(() => {
    loadBalance();
  }, []);

  return (
    <Card className="p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] text-[var(--color-text-muted)]">
            <WalletCards className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--color-text)]">账户余额</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              查询 NexusAI 上游模型账户余额，仅管理员可见。
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={loadBalance} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新余额
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4 text-sm text-[var(--color-text-muted)]">
          {error}
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-text-faint)]">remain_amount</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {balance ? balance.remain_amount.toLocaleString("zh-CN") : loading ? "查询中..." : "-"}
            </p>
          </div>
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
            <p className="text-xs text-[var(--color-text-faint)]">remain_quota</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">
              {balance ? balance.remain_quota.toLocaleString("zh-CN") : loading ? "查询中..." : "-"}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function RoleQuotaCard() {
  const { toast } = useToast();
  const [quotas, setQuotas] = useState<RoleQuota[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingRole, setSavingRole] = useState<UserRole | null>(null);

  async function loadQuotas() {
    setLoading(true);
    const response = await fetch("/api/admin/role-quotas");
    const data = await response.json().catch(() => ({}));
    setLoading(false);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "角色额度加载失败" });
      return;
    }

    setQuotas(data.quotas || []);
  }

  useEffect(() => {
    loadQuotas();
  }, []);

  function updateLocal(role: UserRole, field: "imageDailyLimit" | "videoDailyLimit", value: string) {
    const number = Math.max(Number(value || 0), 0);
    setQuotas((current) => current.map((item) => (item.role === role ? { ...item, [field]: Number.isFinite(number) ? Math.floor(number) : 0 } : item)));
  }

  async function saveQuota(quota: RoleQuota) {
    setSavingRole(quota.role);
    const response = await fetch(`/api/admin/role-quotas/${quota.role}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDailyLimit: quota.imageDailyLimit,
        videoDailyLimit: quota.videoDailyLimit
      })
    });
    const data = await response.json().catch(() => ({}));
    setSavingRole(null);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "角色额度保存失败" });
      return;
    }

    toast({ type: "success", message: `${getRoleLabel(quota.role)}额度已保存` });
    loadQuotas();
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-lg font-medium text-[var(--color-text)]">角色每日额度</h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">按角色控制图片生成和视频生成的每日提交次数。</p>
        </div>
        <Button variant="secondary" size="sm" onClick={loadQuotas} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          刷新额度
        </Button>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        {quotas.map((quota) => (
          <div key={quota.role} className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="font-medium text-[var(--color-text)]">{getRoleLabel(quota.role)}</h3>
              <Badge>{quota.role.toLowerCase()}</Badge>
            </div>
            <div className="grid gap-3">
              <Field label="图片每日次数">
                <Input
                  type="number"
                  min={0}
                  value={quota.imageDailyLimit}
                  onChange={(event) => updateLocal(quota.role, "imageDailyLimit", event.target.value)}
                />
              </Field>
              <Field label="视频每日次数">
                <Input
                  type="number"
                  min={0}
                  value={quota.videoDailyLimit}
                  onChange={(event) => updateLocal(quota.role, "videoDailyLimit", event.target.value)}
                />
              </Field>
              <Button type="button" variant="secondary" size="sm" disabled={savingRole === quota.role} onClick={() => saveQuota(quota)}>
                {savingRole === quota.role ? "保存中..." : "保存额度"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function CreateUserDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<{ username: string; role: UserRole; password: string }>({ username: "", role: "TEACHER", password: "" });
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!form.username.trim()) {
      setError("用户名不能为空");
      return;
    }

    if (form.password && form.password.length < 8) {
      setError("初始密码至少需要 8 位");
      return;
    }

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast({ type: "error", message: data.message || "用户创建失败" });
      return;
    }

    toast({ type: "success", message: "用户已创建" });
    setForm({ username: "", role: "TEACHER", password: "" });
    onClose();
    onDone();
  }

  return (
    <Dialog open={open} title="添加用户" onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit}>
        {error ? <p className="rounded-lg border border-red-300/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</p> : null}
        <Field label="用户名">
          <Input value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
        </Field>
        <Field label="角色">
          <select
            className="h-10 rounded-lg border border-white/10 bg-[#161618] px-3 text-sm text-white outline-none focus:border-white/[0.45]"
            value={form.role}
            onChange={(event) =>
              setForm((current) => ({ ...current, role: event.target.value as UserRole }))
            }
          >
            {roleOptions.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="初始密码">
          <Input type="password" value={form.password} placeholder="留空使用默认初始密码" onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">创建</Button>
        </div>
      </form>
    </Dialog>
  );
}

function BulkImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function parseFile(nextFile: File) {
    setFile(nextFile);
    setResult(null);
    setPreview([]);

    if (nextFile.size > MAX_FILE_SIZE) {
      toast({ type: "error", message: "文件大小不能超过 5MB" });
      return;
    }

    const ext = nextFile.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx") {
      toast({ type: "error", message: "仅支持 .csv 或 .xlsx 文件" });
      return;
    }

    setParsing(true);
    try {
      const rows = ext === "csv" ? await parseCsvFile(nextFile) : await parseXlsxFile(nextFile);
      setPreview(validatePreviewRows(rows));
      toast({ type: "success", message: "文件解析完成，请确认预览后导入" });
    } catch (error) {
      toast({ type: "error", message: error instanceof Error ? error.message : "文件解析失败" });
    } finally {
      setParsing(false);
    }
  }

  async function confirmImport(event: FormEvent) {
    event.preventDefault();
    const validRows = preview.filter((row) => row.status === "valid");

    if (!preview.length) {
      toast({ type: "error", message: "请先上传并解析文件" });
      return;
    }

    if (!validRows.length) {
      toast({ type: "error", message: "没有可导入的有效用户" });
      return;
    }

    setSubmitting(true);
    const response = await fetch("/api/users/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        users: validRows.map((row) => ({
          username: row.username,
          role: row.role,
          password: row.password,
          row: row.row
        }))
      })
    });
    const data = await response.json().catch(() => ({}));
    setSubmitting(false);

    if (!response.ok) {
      toast({ type: "error", message: data.message || "导入失败" });
      return;
    }

    setResult(data);
    toast({ type: "success", message: `导入完成：成功 ${data.successCount} 个，失败 ${data.failedCount} 个` });
    onDone();
  }

  const invalidCount = preview.filter((row) => row.status === "invalid").length;

  return (
    <Dialog open={open} title="批量导入用户" onClose={onClose}>
      <form className="grid gap-5" onSubmit={confirmImport}>
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4">
          <p className="text-sm font-medium text-white">请先下载导入模板，按模板填写后再上传 Excel 或 CSV 文件。</p>
          <ul className="mt-3 grid gap-1 text-xs leading-5 text-white/[0.52]">
            <li>username 必填且唯一</li>
            <li>role 可选，只能为 admin、teacher 或 student；留空默认 teacher</li>
            <li>password 可选，留空则使用默认初始密码</li>
            <li>password 如填写必须至少 8 位</li>
          </ul>
          <a
            href="/templates/user-import-template.xlsx"
            download
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:border-white/20 hover:bg-white/[0.07]"
          >
              <Download className="h-4 w-4" />
              下载 Excel 模板
          </a>
        </div>

        <FileUpload accept=".csv,.xlsx" file={file} onFile={parseFile} />

        {parsing ? <TableSkeleton rows={3} columns={4} /> : null}

        {preview.length ? (
          <div className="overflow-hidden rounded-lg border border-white/10">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.025] px-4 py-3 text-sm">
              <span>预览 {preview.length} 条，{invalidCount} 条需要修正</span>
              <span className="text-xs text-white/[0.42]">单次最多导入 {MAX_IMPORT_ROWS} 条</span>
            </div>
            <div className="max-h-64 overflow-auto">
              <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-[#111113] text-white/[0.42]">
                  <tr className="border-b border-white/10">
                    <th className="px-4 py-3 font-medium">行号</th>
                    <th className="px-4 py-3 font-medium">username</th>
                    <th className="px-4 py-3 font-medium">role</th>
                    <th className="px-4 py-3 font-medium">password</th>
                    <th className="px-4 py-3 font-medium">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 80).map((row) => (
                    <tr key={row.row} className="border-b border-white/[0.06]">
                      <td className="px-4 py-3 text-white/[0.42]">{row.row}</td>
                      <td className="px-4 py-3">{row.username || "-"}</td>
                      <td className="px-4 py-3">{row.role || "TEACHER"}</td>
                      <td className="px-4 py-3">{row.password ? "已填写" : "默认密码"}</td>
                      <td className="px-4 py-3">
                        {row.status === "valid" ? (
                          <span className="text-white/[0.72]">有效</span>
                        ) : (
                          <span className="text-red-200">{row.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.035] p-4 text-sm text-white/[0.62]">
            <p>总数 {result.totalCount}，成功 {result.successCount}，失败 {result.failedCount}</p>
            {result.duplicateUsernames.length ? (
              <p className="mt-2">重复用户名：{result.duplicateUsernames.join("、")}</p>
            ) : null}
            {result.failed.length ? (
              <div className="mt-3 grid gap-1 text-xs text-white/[0.48]">
                {result.failed.map((item, index) => (
                  <p key={`${item.row}-${index}`}>
                    第 {item.row} 行 {item.username ? `(${item.username}) ` : ""}{item.reason}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>关闭</Button>
          <Button type="submit" variant="primary" disabled={submitting || parsing || !preview.length}>
            {submitting ? "导入中..." : "确认导入"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

async function parseCsvFile(file: File) {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim()
  });

  if (parsed.errors.length) {
    throw new Error("CSV 格式错误");
  }

  assertHeaders(parsed.meta.fields || []);
  return parsed.data.map((item, index) => ({
    row: index + 2,
    username: item.username || "",
    role: item.role || "",
    password: item.password || ""
  }));
}

async function parseXlsxFile(file: File) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel 文件没有可读取的工作表");
  }

  const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets[sheetName], {
    header: 1,
    blankrows: false
  });
  const headers = (rows[0] || []).map((item) => String(item || "").trim());
  assertHeaders(headers);

  return rows.slice(1).map((row, index) => ({
    row: index + 2,
    username: String(row[0] || ""),
    role: String(row[1] || ""),
    password: String(row[2] || "")
  }));
}

function assertHeaders(headers: string[]) {
  const isValid =
    headers.length >= REQUIRED_HEADERS.length &&
    REQUIRED_HEADERS.every((header, index) => headers[index] === header);

  if (!isValid) {
    throw new Error("表头必须为 username, role, password");
  }
}

function validatePreviewRows(rows: Array<{ row: number; username: string; role: string; password: string }>) {
  const nonEmptyRows = rows.filter((row) => row.username.trim() || row.role.trim() || row.password.trim());

  if (nonEmptyRows.length > MAX_IMPORT_ROWS) {
    return [
      {
        row: 0,
        username: "",
        role: "",
        password: "",
        status: "invalid" as const,
        reason: `单次最多导入 ${MAX_IMPORT_ROWS} 条用户`
      }
    ];
  }

  const seen = new Set<string>();
  return nonEmptyRows.map<ImportPreviewRow>((row) => {
    const username = row.username.trim();
    const rawRole = row.role.trim().toUpperCase();
    const role = rawRole === "USER" ? "TEACHER" : rawRole || "TEACHER";
    const password = row.password.trim();
    const key = username.toLowerCase();

    if (!username) {
      return { ...row, username, role, password, status: "invalid", reason: "用户名为空" };
    }

    if (seen.has(key)) {
      return { ...row, username, role, password, status: "invalid", reason: "文件内用户名重复" };
    }
    seen.add(key);

    if (role !== "ADMIN" && role !== "TEACHER" && role !== "STUDENT") {
      return { ...row, username, role, password, status: "invalid", reason: "角色无效" };
    }

    if (password && password.length < 8) {
      return { ...row, username, role, password, status: "invalid", reason: "密码至少 8 位" };
    }

    return { ...row, username, role, password, status: "valid" };
  });
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      return;
    }

    if (password && password.length < 8) {
      toast({ type: "error", message: "新密码至少需要 8 位" });
      return;
    }

    const response = await fetch(`/api/users/${user.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      toast({ type: "error", message: data.message || "密码重置失败" });
      return;
    }

    toast({ type: "success", message: "密码已重置" });
    setPassword("");
    onClose();
  }

  return (
    <Dialog open={Boolean(user)} title="重置密码" onClose={onClose}>
      <form className="grid gap-4" onSubmit={submit}>
        <p className="text-sm text-white/[0.52]">正在为 {user?.username} 重置密码。留空将使用默认初始密码。</p>
        <Field label="新密码">
          <Input type="password" value={password} placeholder="至少 8 位，留空使用默认密码" onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">确认重置</Button>
        </div>
      </form>
    </Dialog>
  );
}
