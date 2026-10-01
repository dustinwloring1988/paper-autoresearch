import { api } from "./client";
import type {
  Experiment,
  ExperimentIdea,
  Study,
  StudyLeaderboardRow,
  StudyProgressPoint,
  StudySetupCheck,
} from "@paperclipai/shared";

export interface StudySummary {
  study: Study;
  setupChecks: StudySetupCheck[];
  leaderboard: StudyLeaderboardRow[];
  progress: StudyProgressPoint[];
  ideas: ExperimentIdea[];
}

export const studiesApi = {
  list: (companyId: string) => api.get<Study[]>(`/companies/${companyId}/studies`),
  get: (companyId: string, studyId: string) =>
    api.get<Study & { setupChecks: StudySetupCheck[] }>(
      `/companies/${companyId}/studies/${studyId}`,
    ),
  summary: (companyId: string, studyId: string) =>
    api.get<StudySummary>(`/companies/${companyId}/studies/${studyId}/summary`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Study>(`/companies/${companyId}/studies`, data),
  update: (companyId: string, studyId: string, data: Record<string, unknown>) =>
    api.patch<Study>(`/companies/${companyId}/studies/${studyId}`, data),
  start: (companyId: string, studyId: string, data: Record<string, unknown> = {}) =>
    api.post<Study>(`/companies/${companyId}/studies/${studyId}/start`, data),
  pause: (companyId: string, studyId: string) =>
    api.post<Study>(`/companies/${companyId}/studies/${studyId}/pause`, {}),
  conclude: (companyId: string, studyId: string, data: Record<string, unknown> = {}) =>
    api.post<Study>(`/companies/${companyId}/studies/${studyId}/conclude`, data),
  experiments: (companyId: string, studyId: string) =>
    api.get<Experiment[]>(`/companies/${companyId}/studies/${studyId}/experiments`),
  leaderboard: (companyId: string, studyId: string) =>
    api.get<StudyLeaderboardRow[]>(`/companies/${companyId}/studies/${studyId}/leaderboard`),
  progress: (companyId: string, studyId: string) =>
    api.get<StudyProgressPoint[]>(`/companies/${companyId}/studies/${studyId}/progress`),
  ideas: (companyId: string, studyId: string) =>
    api.get<ExperimentIdea[]>(`/companies/${companyId}/studies/${studyId}/ideas`),
};