"use client";

import { useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  CircuitBoard,
  Cpu,
  CreditCard,
  Download,
  Gauge,
  GitBranch,
  LineChart as LineChartIcon,
  MessageSquare,
  MoreHorizontal,
  Search,
  Settings,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

type Metric = {
  label: string;
  value: string;
  delta: number;
  icon: React.ComponentType<{ className?: string }>;
};

const METRICS: Metric[] = [
  { label: "Active workspaces", value: "12,847", delta: 12.4, icon: Users },
  { label: "AI requests / min", value: "8,392", delta: 24.1, icon: Sparkles },
  { label: "Avg latency", value: "184ms", delta: -8.3, icon: Gauge },
  { label: "Monthly revenue", value: "$48,210", delta: 6.7, icon: CreditCard },
];

const SPARK = [12, 18, 15, 22, 28, 25, 33, 30, 38, 42, 38, 47, 51, 48, 56, 62];

const AGENTS = [
  { name: "Research Agent", status: "Active", tasks: 24, load: 78, color: "from-violet-500 to-fuchsia-500" },
  { name: "Code Reviewer", status: "Active", tasks: 18, load: 62, color: "from-sky-500 to-cyan-500" },
  { name: "Data Analyst", status: "Idle", tasks: 7, load: 14, color: "from-amber-500 to-orange-500" },
  { name: "Email Triage", status: "Active", tasks: 41, load: 88, color: "from-emerald-500 to-teal-500" },
];

const ACTIVITY = [
  { user: "Maya Chen", action: "deployed", target: "billing-service v2.4.1", time: "2m ago", type: "deploy" },
  { user: "Lukas Bauer", action: "merged PR", target: "#1284 — refactor: auth flow", time: "12m ago", type: "merge" },
  { user: "Priya Shah", action: "ran agent", target: "Quarterly report draft", time: "31m ago", type: "agent" },
  { user: "Tom Becker", action: "added integration", target: "Linear", time: "1h ago", type: "integration" },
  { user: "Aisha Khan", action: "commented on", target: "Q3 roadmap", time: "2h ago", type: "comment" },
];

function SparklinePath({ data }: { data: number[] }) {
  const w = 240;
  const h = 56;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = Math.max(1, max - min);
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${points.join(" L ")}`;
  const area = `${line} L ${w},${h} L 0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" className="text-violet-500" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-violet-500" />
    </svg>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  const positive = metric.delta >= 0;
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/60 backdrop-blur-sm transition hover:border-border hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
            <Icon className="h-5 w-5" />
          </div>
          <Badge
            variant="secondary"
            className={`gap-1 ${positive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400"}`}
          >
            {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(metric.delta).toFixed(1)}%
          </Badge>
        </div>
        <div className="mt-4">
          <div className="text-2xl font-semibold tracking-tight">{metric.value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{metric.label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DemoDashboardPage() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-violet-500/5 text-foreground">
      <div className="mx-auto flex max-w-[1400px] gap-6 p-4 lg:p-6">
        {/* Sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-6 space-y-1">
            <div className="mb-6 flex items-center gap-2 px-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/30">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">AssistantX</div>
                <div className="text-xs text-muted-foreground">Admin Console</div>
              </div>
            </div>
            {[
              { label: "Overview", icon: LineChartIcon, active: true },
              { label: "Agents", icon: Bot },
              { label: "Workspaces", icon: Users },
              { label: "Integrations", icon: GitBranch },
              { label: "Compute", icon: Cpu },
              { label: "Activity", icon: Activity },
              { label: "Settings", icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    item.active
                      ? "bg-violet-500/10 text-violet-600 dark:text-violet-300"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
            <Separator className="my-4" />
            <Card className="border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-violet-500" />
                  <span className="text-sm font-semibold">Upgrade to Pro</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Unlock unlimited agents and team analytics.
                </p>
                <Button size="sm" className="mt-3 w-full bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90">
                  See plans
                </Button>
              </CardContent>
            </Card>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 space-y-6">
          {/* Topbar */}
          <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Welcome back — here&apos;s what&apos;s happening across your workspace.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search agents, workspaces…" className="pl-9" />
              </div>
              <Button variant="outline" size="icon" aria-label="Notifications">
                <Bell className="h-4 w-4" />
              </Button>
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                  ZW
                </AvatarFallback>
              </Avatar>
            </div>
          </header>

          {/* Metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {METRICS.map((m) => (
              <MetricCard key={m.label} metric={m} />
            ))}
          </div>

          {/* Tabs + content */}
          <Tabs value={tab} onValueChange={setTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2 border-border/60 bg-card/60 backdrop-blur-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div>
                      <CardTitle className="text-base">Request volume</CardTitle>
                      <p className="text-xs text-muted-foreground">Last 24 hours</p>
                    </div>
                    <Badge variant="secondary" className="gap-1">
                      <ArrowUpRight className="h-3 w-3" /> 24.1%
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold tracking-tight">8,392 / min</div>
                    <div className="mt-4">
                      <SparklinePath data={SPARK} />
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>00:00</span>
                      <span>06:00</span>
                      <span>12:00</span>
                      <span>18:00</span>
                      <span>now</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="text-base">Compute health</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "CPU", value: 64, icon: Cpu },
                      { label: "Memory", value: 47, icon: CircuitBoard },
                      { label: "Queue depth", value: 22, icon: Activity },
                    ].map((row) => {
                      const Icon = row.icon;
                      return (
                        <div key={row.label}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Icon className="h-3.5 w-3.5" />
                              {row.label}
                            </span>
                            <span className="font-medium">{row.value}%</span>
                          </div>
                          <Progress value={row.value} className="h-1.5" />
                        </div>
                      );
                    })}
                    <Button variant="outline" size="sm" className="w-full">
                      <Download className="mr-2 h-3.5 w-3.5" /> Export report
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">Active agents</CardTitle>
                  <Button variant="ghost" size="sm">
                    View all <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2">
                    {AGENTS.map((a) => (
                      <div
                        key={a.name}
                        className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3"
                      >
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${a.color} text-white shadow-lg`}
                        >
                          <Bot className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{a.name}</span>
                            <Badge
                              variant="secondary"
                              className={
                                a.status === "Active"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                  : "bg-muted text-muted-foreground"
                              }
                            >
                              {a.status}
                            </Badge>
                          </div>
                          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{a.tasks} tasks</span>
                            <Progress value={a.load} className="h-1 flex-1" />
                            <span className="tabular-nums">{a.load}%</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="agents">
              <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-base">All agents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {AGENTS.map((a) => (
                    <div key={a.name} className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${a.color} text-white`}>
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">{a.tasks} tasks · {a.load}% load</div>
                      </div>
                      <Badge variant="secondary">{a.status}</Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
              <Card className="border-border/60 bg-card/60 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="text-base">Recent activity</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {ACTIVITY.map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-muted text-xs">
                          {a.user.split(" ").map((n) => n[0]).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-sm">
                        <span className="font-medium">{a.user}</span>{" "}
                        <span className="text-muted-foreground">{a.action}</span>{" "}
                        <span className="font-medium">{a.target}</span>
                        <div className="text-xs text-muted-foreground">{a.time}</div>
                      </div>
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
