import api from "./api";
import type { SupervisorUser } from "../types";

export const supervisorsApi = {
  async listAll(): Promise<SupervisorUser[]> {
    const { data } = await api.get<SupervisorUser[]>("/admin/supervisors");
    return data;
  },
};
