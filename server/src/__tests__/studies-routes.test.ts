import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockStudiesService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  start: vi.fn(),
  pause: vi.fn(),
  conclude: vi.fn(),
  assertSetupComplete: vi.fn(),
}));

const mockExperimentsService = vi.hoisted(() => ({
  listExperiments: vi.fn(),
  getExperiment: vi.fn(),
  leaderboard: vi.fn(),
  progress: vi.fn(),
}));

const mockIdeasService = vi.hoisted(() => ({
  list: vi.fn(),
}));

vi.mock("../services/studies/studies.js", () => ({
  studiesService: () => mockStudiesService,
}));

vi.mock("../services/studies/experiments.js", () => ({
  experimentsService: () => mockExperimentsService,
}));

vi.mock("../services/studies/ideas.js", () => ({
  ideasService: () => mockIdeasService,
}));

const study = {
  id: "study-1",
  companyId: "company-1",
  name: "Baseline sweep",
  tag: "baseline-sweep",
  branchName: "autoresearch/baseline-sweep",
  status: "setup",
};

async function createApp(
  actor: Record<string, unknown> = {
    type: "board",
    userId: "user-1",
    companyIds: ["company-1"],
    source: "session",
    isInstanceAdmin: false,
  },
) {
  vi.resetModules();
  const [{ errorHandler }, { studyRoutes }] = await Promise.all([
    import("../middleware/index.js") as Promise<typeof import("../middleware/index.js")>,
    import("../routes/studies.js") as Promise<typeof import("../routes/studies.js")>,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = { ...actor };
    next();
  });
  app.use("/api", studyRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("study routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStudiesService.list.mockResolvedValue([study]);
    mockStudiesService.getById.mockResolvedValue(study);
    mockStudiesService.assertSetupComplete.mockResolvedValue([]);
    mockStudiesService.create.mockResolvedValue(study);
    mockStudiesService.pause.mockResolvedValue({ ...study, status: "paused" });
    mockStudiesService.start.mockResolvedValue({ ...study, status: "active" });
    mockExperimentsService.listExperiments.mockResolvedValue([]);
    mockExperimentsService.leaderboard.mockResolvedValue([]);
    mockExperimentsService.progress.mockResolvedValue([]);
    mockIdeasService.list.mockResolvedValue([]);
  });

  it("lists studies for a company the actor can reach", async () => {
    const app = await createApp();
    const res = await request(app).get("/api/companies/company-1/studies");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("denies a study list for a company outside the actor's allow-list", async () => {
    const app = await createApp();
    const res = await request(app).get("/api/companies/company-2/studies");
    expect(res.status).toBe(403);
  });

  it("rejects an unknown status filter instead of passing it to the service", async () => {
    const app = await createApp();
    const res = await request(app).get("/api/companies/company-1/studies?status=bogus");
    expect(res.status).toBe(400);
    expect(mockStudiesService.list).not.toHaveBeenCalled();
  });

  it("forwards a valid status filter to the service", async () => {
    const app = await createApp();
    const res = await request(app).get("/api/companies/company-1/studies?status=active");
    expect(res.status).toBe(200);
    expect(mockStudiesService.list).toHaveBeenCalledWith("company-1", {
      status: "active",
      projectId: undefined,
    });
  });

  it("returns setup checks alongside a single study", async () => {
    mockStudiesService.assertSetupComplete.mockResolvedValue([
      { key: "uv_on_path", label: "uv on PATH", ok: false, detail: "spawnSync uv ENOENT" },
    ]);
    const app = await createApp();
    const res = await request(app).get("/api/companies/company-1/studies/study-1");
    expect(res.status).toBe(200);
    expect(res.body.setupChecks).toHaveLength(1);
    expect(res.body.setupChecks[0].ok).toBe(false);
  });

  it("scopes a study read to the company in the path", async () => {
    const app = await createApp();
    await request(app).get("/api/companies/company-1/studies/study-1");
    expect(mockStudiesService.getById).toHaveBeenCalledWith("company-1", "study-1");
  });

  it("creates a study and stamps the branch name the service derives", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/companies/company-1/studies")
      .send({ name: "Baseline sweep", tag: "baseline-sweep", repoPath: "/repo", baseRef: "main" });
    expect(res.status).toBe(201);
    expect(mockStudiesService.create).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-1", tag: "baseline-sweep" }),
    );
  });

  it("rejects a create whose tag would produce an unsafe branch name", async () => {
    const app = await createApp();
    const res = await request(app)
      .post("/api/companies/company-1/studies")
      .send({ name: "Bad", tag: "has spaces", repoPath: "/repo", baseRef: "main" });
    expect(res.status).toBe(400);
    expect(mockStudiesService.create).not.toHaveBeenCalled();
  });

  it("pauses a study", async () => {
    const app = await createApp();
    const res = await request(app).post("/api/companies/company-1/studies/study-1/pause");
    expect(res.status).toBe(200);
    expect(mockStudiesService.pause).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: "company-1", studyId: "study-1" }),
    );
  });

  it("builds the detail summary from one study read", async () => {
    const app = await createApp();
    const res = await request(app).get("/api/companies/company-1/studies/study-1/summary");
    expect(res.status).toBe(200);
    expect(res.body.study.id).toBe("study-1");
    expect(res.body.leaderboard).toEqual([]);
    expect(res.body.progress).toEqual([]);
    expect(res.body.ideas).toEqual([]);
  });

  it("does not serve another study's experiments under this study's path", async () => {
    mockExperimentsService.getExperiment.mockResolvedValue({
      id: "exp-1",
      studyId: "study-other",
    });
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/studies/study-1/experiments/exp-1",
    );
    expect(res.status).toBe(404);
  });

  it("filters experiments by a validated status", async () => {
    const app = await createApp();
    const res = await request(app).get(
      "/api/companies/company-1/studies/study-1/experiments?status=not_a_status",
    );
    expect(res.status).toBe(400);
  });

  it("denies an agent key acting for another company", async () => {
    const app = await createApp({
      type: "agent",
      agentId: "agent-1",
      companyId: "company-2",
      onBehalfOfUserId: "user-1",
      onBehalfOfMemberships: [{ companyId: "company-2", status: "active", membershipRole: "owner" }],
    });
    const res = await request(app).get("/api/companies/company-1/studies");
    expect(res.status).toBe(403);
  });
});