import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FlaskConical,
  Pause,
  Play,
  Plus,
  TriangleAlert,
} from "lucide-react";
import type { Study, StudyStatus } from "@paperclipai/shared";
import { studiesApi, type StudySummary } from "../api/studies";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

const STUDY_STATUS_LABEL: Record<StudyStatus, string> = {
  setup: "Setup",
  active: "Active",
  paused: "Paused",
  concluded: "Concluded",
};

/** val_bpb is the ground truth and lower is better, so a negative delta is a win. */
function formatBpb(value: number | null | undefined, digits = 6): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(digits);
}

function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "±0";
  return `${value > 0 ? "+" : ""}${value.toFixed(6)}`;
}

function StudyRow({
  study,
  onOpen,
}: {
  study: Study;
  onOpen: (studyId: string) => void;
}) {
  const { selectedCompanyId } = useCompany();
  const cache = useQueryClient();
  const companyId = selectedCompanyId!;

  const transition = useMutation({
    mutationFn: (action: "start" | "pause") =>
      action === "start"
        ? studiesApi.start(companyId, study.id)
        : studiesApi.pause(companyId, study.id),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["studies", companyId] });
    },
  });

  return (
    <tr className="h-10 border-b border-border/70">
      <td className="py-2 pl-3 pr-4">
        <button
          type="button"
          onClick={() => onOpen(study.id)}
          className="text-left font-medium hover:underline"
        >
          {study.name}
        </button>
        <div className="text-xs text-muted-foreground">{study.branchName}</div>
      </td>
      <td className="px-4 py-2">
        <Badge variant={study.status === "active" ? "default" : "secondary"}>
          {STUDY_STATUS_LABEL[study.status]}
        </Badge>
      </td>
      <td className="px-4 py-2 tabular-nums">{formatBpb(study.baselineValBpb)}</td>
      <td className="px-4 py-2 tabular-nums font-medium">{formatBpb(study.bestValBpb)}</td>
      <td className="px-4 py-2 tabular-nums">{formatBpb(study.noiseFloorBpb)}</td>
      <td className="px-4 py-2 tabular-nums">{study.experimentCount}</td>
      <td className="px-4 py-2 tabular-nums">
        {study.keepCount} / {study.discardCount} / {study.crashCount}
      </td>
      <td className="px-4 py-2 tabular-nums">
        {study.transientFailures > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <TriangleAlert className="h-3 w-3" aria-hidden="true" />
            {study.transientFailures}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-2">
          {study.status === "active" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={transition.isPending}
              onClick={() => transition.mutate("pause")}
            >
              <Pause className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Pause
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={transition.isPending}
              onClick={() => transition.mutate("start")}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Start
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function NewStudyForm() {
  const { selectedCompanyId } = useCompany();
  const cache = useQueryClient();
  const companyId = selectedCompanyId!;
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [baseRef, setBaseRef] = useState("main");

  const create = useMutation({
    mutationFn: () =>
      studiesApi.create(companyId, {
        name: name.trim(),
        tag: tag.trim(),
        repoPath: repoPath.trim(),
        baseRef: baseRef.trim(),
      }),
    onSuccess: () => {
      setName("");
      setTag("");
      setRepoPath("");
      void cache.invalidateQueries({ queryKey: ["studies", companyId] });
    },
  });

  const ready = name.trim() && tag.trim() && repoPath.trim() && baseRef.trim();

  return (
    <Card>
      <CardHeader>
        <CardTitle>New study</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A study pins one <code>autoresearch/&lt;tag&gt;</code> branch and runs
          training experiments against it. The tag is immutable once created
          because it names the branch and every derived path.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm">
            <span className="text-(length:--text-compact) font-medium">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Baseline sweep"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-(length:--text-compact) font-medium">Tag</span>
            <Input
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="baseline-sweep"
            />
          </label>
          <label className="grid gap-1.5 text-sm sm:col-span-2">
            <span className="text-(length:--text-compact) font-medium">Repo path</span>
            <Input
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="/workspace/autoresearch-win-rtx"
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            <span className="text-(length:--text-compact) font-medium">Base ref</span>
            <Input value={baseRef} onChange={(event) => setBaseRef(event.target.value)} />
          </label>
        </div>
        {create.isError ? (
          <p className="text-sm text-destructive">{create.error.message}</p>
        ) : null}
        <Button size="sm" disabled={!ready || create.isPending} onClick={() => create.mutate()}>
          <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Create study
        </Button>
      </CardContent>
    </Card>
  );
}

function LeaderboardTable({ summary }: { summary: StudySummary }) {
  const rows = useMemo(
    () => [...summary.leaderboard].sort((a, b) => a.sequence - b.sequence),
    [summary.leaderboard],
  );
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No experiments yet.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-(--sz-780px) border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-(length:--text-micro) font-semibold uppercase tracking-widest text-muted-foreground">
            <th className="py-2 pl-3 pr-4">#</th>
            <th className="px-4 py-2">Description</th>
            <th className="px-4 py-2">val_bpb</th>
            <th className="px-4 py-2">Δ vs best</th>
            <th className="px-4 py-2">Memory</th>
            <th className="px-4 py-2">Train</th>
            <th className="px-4 py-2">Params</th>
            <th className="px-4 py-2">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.experimentId} className="h-10 border-b border-border/70">
              <td className="py-2 pl-3 pr-4 tabular-nums text-muted-foreground">
                {row.sequence}
              </td>
              <td className="px-4 py-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 truncate">{row.description}</span>
                  {row.isCurrentBest ? <Badge>best</Badge> : null}
                  {row.isBranchHead ? <Badge variant="secondary">head</Badge> : null}
                </div>
              </td>
              <td className="px-4 py-2 tabular-nums">{formatBpb(row.valBpb)}</td>
              <td className="px-4 py-2 tabular-nums">{formatDelta(row.deltaVsBestAtTime)}</td>
              <td className="px-4 py-2 tabular-nums">
                {row.memoryGb === null ? "—" : `${row.memoryGb.toFixed(2)} GB`}
              </td>
              <td className="px-4 py-2 tabular-nums">
                {row.trainingSeconds === null ? "—" : `${Math.round(row.trainingSeconds)}s`}
              </td>
              <td className="px-4 py-2 tabular-nums">
                {row.numParamsM === null ? "—" : `${row.numParamsM.toFixed(1)}M`}
              </td>
              <td className="px-4 py-2">
                {row.verdict ? (
                  <Badge
                    variant={
                      row.verdict === "keep"
                        ? "default"
                        : row.verdict === "crash"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {row.verdict}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">{row.status}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudyDetail({ studyId }: { studyId: string }) {
  const { selectedCompanyId } = useCompany();
  const companyId = selectedCompanyId!;
  const { data, isPending, error } = useQuery({
    queryKey: ["studies", "detail", companyId, studyId],
    queryFn: () => studiesApi.summary(companyId, studyId),
    enabled: Boolean(companyId && studyId),
  });

  if (isPending) return <PageSkeleton variant="list" />;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (!data) return null;

  const { study, setupChecks } = data;
  const failedChecks = setupChecks.filter((check) => !check.ok);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Baseline val_bpb", value: formatBpb(study.baselineValBpb) },
          { label: "Best val_bpb", value: formatBpb(study.bestValBpb) },
          { label: "Noise floor", value: formatBpb(study.noiseFloorBpb) },
          { label: "Target val_bpb", value: formatBpb(study.targetValBpb) },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="space-y-1">
              <p className="text-(length:--text-micro) uppercase tracking-widest text-muted-foreground">
                {item.label}
              </p>
              <p className="text-(length:--text-lg) font-semibold tabular-nums">
                {item.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Setup checks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Each check names one thing that, if wrong, produces a study that runs for
            hours and measures nothing.
          </p>
          <ul className="space-y-1.5">
            {setupChecks.map((check) => (
              <li key={check.key} className="flex items-start gap-2 text-sm">
                <Checkbox checked={check.ok} disabled aria-label={check.label} />
                <span className="min-w-0">
                  <span className="font-medium">{check.label}</span>
                  <span className="block text-xs text-muted-foreground">{check.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          {failedChecks.length > 0 ? (
            <p className="text-sm text-destructive">
              {failedChecks.length} check{failedChecks.length === 1 ? "" : "s"} failing —
              starting this study would not produce usable metrics.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <LeaderboardTable summary={data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Experiment ideas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.ideas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No ideas proposed yet.</p>
          ) : (
            data.ideas.map((idea) => (
              <div key={idea.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{idea.title}</span>
                  <Badge variant="secondary">{idea.status}</Badge>
                  {idea.family ? <Badge variant="outline">{idea.family}</Badge> : null}
                  <Badge variant="outline">{idea.expectedDirection}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{idea.rationale}</p>
                {idea.rejectionReason ? (
                  <p className="mt-1 text-xs text-destructive">
                    Rejected: {idea.rejectionReason}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function Studies() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const list = useQuery({
    queryKey: ["studies", selectedCompanyId],
    queryFn: () => studiesApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  useMemo(() => {
    setBreadcrumbs(
      selected ? [{ label: "Studies", href: "/studies" }, { label: "Study" }] : [{ label: "Studies" }],
    );
  }, [selected, setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={FlaskConical} message="Select an organization to view studies." />;
  }
  if (list.isPending) return <PageSkeleton variant="list" />;

  return (
    <div className="space-y-6">
      {list.error ? <p className="text-sm text-destructive">{list.error.message}</p> : null}

      {selected ? (
        <>
          <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
            Back to studies
          </Button>
          <StudyDetail studyId={selected} />
        </>
      ) : (
        <>
          {(list.data?.length ?? 0) === 0 ? (
            <EmptyState
              icon={FlaskConical}
              message="No studies yet. Create one to start an autoresearch run."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-(--sz-780px) border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-(length:--text-micro) font-semibold uppercase tracking-widest text-muted-foreground">
                    <th className="py-2 pl-3 pr-4">Study</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Baseline</th>
                    <th className="px-4 py-2">Best</th>
                    <th className="px-4 py-2">Noise floor</th>
                    <th className="px-4 py-2">Runs</th>
                    <th className="px-4 py-2">Keep / discard / crash</th>
                    <th className="px-4 py-2">Infra</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {(list.data ?? []).map((study) => (
                    <StudyRow key={study.id} study={study} onOpen={setSelected} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-start">
            <Button size="sm" variant="outline" onClick={() => setShowNew((value) => !value)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              New study
            </Button>
          </div>

          {showNew ? <NewStudyForm /> : null}
        </>
      )}
    </div>
  );
}