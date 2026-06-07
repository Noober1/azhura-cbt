import api from "./api";
import type { DashboardSnapshot } from "../types";

export const dashboardApi = {
  async get(): Promise<DashboardSnapshot> {
    const { data } = await api.get<DashboardSnapshot>("/admin/dashboard");
    return data;
  },
};
