import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  concludeStudySchema,
  createStudySchema,
  EXPERIMENT_STATUSES,
  startStudySchema,
  STUDY_STATUSES,
  updateStudySchema,
} from "@paperclipai/shared";
import type { ExperimentStatus, StudyStatus } from "@paperclipai/shared";
import { badRequest, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { experimentsService } from "../services/studies/experiments.js";
import { ideasService } from "../services/studies/ideas.js";
import { studiesService } from "../services/studies/studies.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

/**
 * Read/control surface for autoresearch studies.
 *
 * The loop itself is server-side and deterministic (`server/src/services/studies/`):
 * the scheduler pulses each study, the dispatcher arbitrates the single GPU via the
 * `experiments_single_running_per_study` partial unique index, and the executor
 * adjudicates keep/discard. Nothing here decides a verdict — these routes expose what
 * the framework already decided, and let an operator create, start, pause, and conclude
 * a study.
 *
 * Every read is company-scoped through `assertCompanyAccess`, and mutations run through
 * the service functions that already write the `study.*` activity-log entries, so the
 * routes add transport, not behaviour.
 */
export function studyRoutes(db: Db) {
  const router = Router();
  const studies = studiesService(db);
  const experiments = experimentsService(db);
  const ideas = ideasService(db);

  function companyIdFrom(req: Request) {
    return req.params.companyId as string;
  }

  /** Reads a status query param through the shared enum instead of trusting the wire. */
  function parseStatus(raw: unknown): StudyStatus | undefined {
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    const value = raw.trim();
    if (!(STUDY_STATUSES as readonly string[]).includes(value)) {
      throw badRequest(`status must be one of: ${STUDY_STATUSES.join(", ")}`);
    }
    return value as StudyStatus;
  }

  router.get("/companies/:companyId/studies", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const rows = await studies.list(companyId, {
      status: parseStatus(req.query.status),
      projectId: typeof req.query.projectId === "string" ? req.query.projectId : undefined,
    });
    res.json(rows);
  });

  router.get("/companies/:companyId/studies/:studyId", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const study = await studies.getById(companyId, req.params.studyId as string);
    res.json({ ...study, setupChecks: await studies.assertSetupComplete(companyId, study.id) });
  });

  router.post("/companies/:companyId/studies", validate(createStudySchema), async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const created = await studies.create({
      ...req.body,
      companyId,
      actor: { actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId },
    });
    res.status(201).json(created);
  });

  router.patch(
    "/companies/:companyId/studies/:studyId",
    validate(updateStudySchema),
    async (req, res) => {
      const companyId = companyIdFrom(req);
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const updated = await studies.update({
        ...req.body,
        companyId,
        studyId: req.params.studyId as string,
        actor: { actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId },
      });
      res.json(updated);
    },
  );

  router.post(
    "/companies/:companyId/studies/:studyId/start",
    validate(startStudySchema),
    async (req, res) => {
      const companyId = companyIdFrom(req);
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const started = await studies.start({
        ...req.body,
        companyId,
        studyId: req.params.studyId as string,
        actor: { actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId },
      });
      res.json(started);
    },
  );

  router.post("/companies/:companyId/studies/:studyId/pause", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const paused = await studies.pause({
      companyId,
      studyId: req.params.studyId as string,
      actor: { actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId },
    });
    res.json(paused);
  });

  router.post(
    "/companies/:companyId/studies/:studyId/conclude",
    validate(concludeStudySchema),
    async (req, res) => {
      const companyId = companyIdFrom(req);
      assertCompanyAccess(req, companyId);
      const actor = getActorInfo(req);
      const concluded = await studies.conclude({
        ...req.body,
        companyId,
        studyId: req.params.studyId as string,
        actor: { actorType: actor.actorType, actorId: actor.actorId, agentId: actor.agentId },
      });
      res.json(concluded);
    },
  );

  /** Everything the detail page renders in one round trip. */
  router.get("/companies/:companyId/studies/:studyId/summary", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const studyId = req.params.studyId as string;
    const study = await studies.getById(companyId, studyId);
    res.json({
      study,
      setupChecks: await studies.assertSetupComplete(companyId, studyId),
      leaderboard: await experiments.leaderboard(companyId, studyId),
      progress: await experiments.progress(companyId, studyId),
      ideas: await ideas.list(companyId, studyId),
    });
  });

  function parseExperimentStatus(raw: unknown): ExperimentStatus | undefined {
    if (typeof raw !== "string" || raw.trim() === "") return undefined;
    const value = raw.trim();
    if (!(EXPERIMENT_STATUSES as readonly string[]).includes(value)) {
      throw badRequest(`status must be one of: ${EXPERIMENT_STATUSES.join(", ")}`);
    }
    return value as ExperimentStatus;
  }

  router.get("/companies/:companyId/studies/:studyId/experiments", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const studyId = req.params.studyId as string;
    // Scoped by studyId so a caller cannot read another study's runs by guessing an id.
    await studies.getById(companyId, studyId);
    res.json(
      await experiments.listExperiments(companyId, studyId, {
        status: parseExperimentStatus(req.query.status),
      }),
    );
  });

  router.get("/companies/:companyId/studies/:studyId/experiments/:experimentId", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const studyId = req.params.studyId as string;
    await studies.getById(companyId, studyId);
    const experiment = await experiments.getExperiment(
      companyId,
      req.params.experimentId as string,
    );
    if (experiment.studyId !== studyId) throw notFound("Experiment not found");
    res.json(experiment);
  });

  router.get("/companies/:companyId/studies/:studyId/leaderboard", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const studyId = req.params.studyId as string;
    await studies.getById(companyId, studyId);
    res.json(await experiments.leaderboard(companyId, studyId));
  });

  router.get("/companies/:companyId/studies/:studyId/progress", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const studyId = req.params.studyId as string;
    await studies.getById(companyId, studyId);
    res.json(await experiments.progress(companyId, studyId));
  });

  router.get("/companies/:companyId/studies/:studyId/ideas", async (req, res) => {
    const companyId = companyIdFrom(req);
    assertCompanyAccess(req, companyId);
    const studyId = req.params.studyId as string;
    await studies.getById(companyId, studyId);
    res.json(await ideas.list(companyId, studyId));
  });

  return router;
}